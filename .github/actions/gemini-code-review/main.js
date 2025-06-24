const core = require('@actions/core');
const github = require('@actions/github');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

async function run() {
  try {
    // 1. Obter Entradas
    const githubToken = core.getInput('github-token');
    const geminiApiKey = core.getInput('gemini-api-key');

    // 2. Inicializar Clientes
    const octokit = github.getOctokit(githubToken);
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    // 3. Obter Contexto do Pull Request
    const pr = github.context.payload.pull_request;
    if (!pr) {
      core.setFailed('This action can only be run on pull requests.');
      return;
    }

    // 4. Obter o Diff do PR
    const { data: diff } = await axios.get(pr.diff_url);
    if (!diff) {
        console.log("Could not get diff. Skipping review.");
        return;
    }

    // 5. Preparar o Prompt Otimizado
    const prompt = `
      **Analyse the following code diff for security vulnerabilities and code quality issues.**

      **Your Task & Rules:**
      1.  **Security First:** Prioritize all types of security vulnerabilities.
      2.  **Code Quality:** Identify bugs, performance issues, and opportunities for improvement.
      3.  **Output Format:** Your response MUST be a single, valid JSON array of "comment" objects. Do NOT output any text, notes, or markdown formatting before or after the JSON array.

      **"Comment" Object Structure:**
      * \`"filePath"\`: The full path of the file.
      * \`"lineNumber"\`: The specific line number for the comment (must be a number).
      * \`"commentBody"\`: The review comment in Markdown.

      **CRITICAL FORMATTING RULES - YOU MUST FOLLOW THESE:**
      1.  **JSON ONLY:** Your entire output must be a single block of valid JSON, parsable by a standard parser.
      2.  **ESCAPE DOUBLE QUOTES:** Within the string value for \`"commentBody"\`, all double quotes (\`"\`) MUST be escaped with a backslash (e.g., \`\\"your string\\"\`). This is the most important rule.
      3.  **DO NOT BREAK STRUCTURE:** Do not break the JSON structure, even if the code you are analyzing is confusing.

      **If no issues are found, return an empty JSON array: \`[]\`.**

      Here is the diff to analyze:
      \`\`\`diff
      ${diff}
      \`\`\`
  `;

    // 6. Chamar a API do Gemini e Processar a Resposta
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let textResponse = response.text();

    let reviewComments;
    try {
      let textResponse = response.text();

      // --- ETAPA 1: CORRIGIR VÍRGULAS FALTANTES (O NOVO FIX) ---
      // Procura por } seguido por { (com espaços/newlines no meio) e insere uma vírgula.
      const fixedCommasText = textResponse.replace(/\}(?=\s*\{)/g, '},');

      // --- ETAPA 2: SANITIZAR BARRAS INVERTIDAS ---
      const sanitizedText = fixedCommasText.replace(/\\/g, '\\\\');
      
      // --- ETAPA 3: EXTRAIR O BLOCO JSON ---
      // O resto do código agora usa o texto totalmente corrigido e sanitizado
      const startIndex = sanitizedText.indexOf('[');
      const endIndex = sanitizedText.lastIndexOf(']');
      
      if (startIndex === -1 || endIndex === -1) {
        throw new Error("No JSON array found in the response.");
      }

      const jsonText = sanitizedText.substring(startIndex, endIndex + 1);

      // --- ETAPA 4: FAZER O PARSE FINAL ---
      reviewComments = JSON.parse(jsonText);
      console.log("Successfully auto-corrected, sanitized, extracted, and parsed JSON response from Gemini.");

    } catch(e) {
      // Para depuração, logamos a resposta crua que recebemos ANTES de qualquer tratamento
      console.error("Raw response from Gemini (before any correction):", response.text());
      core.setFailed(`Could not parse the JSON response from the AI model. Error: ${e.message}`);
      return;
    }

    if (!reviewComments || reviewComments.length === 0) {
        console.log("Gemini found no issues to comment on.");
        return;
    }

    // 7. Formatar e Enviar a Revisão para o GitHub
    const commentsForReview = reviewComments.map(c => {
        // Validação básica para evitar erros na API do GitHub
        if (!c.filePath || typeof c.lineNumber !== 'number' || !c.commentBody) {
            return null;
        }
        return {
            path: c.filePath,
            line: c.lineNumber,
            body: `**🤖 Gemini Review:**\n\n${c.commentBody}`
        };
    }).filter(Boolean); // Filtra quaisquer comentários nulos/inválidos

    if (commentsForReview.length > 0) {
        await octokit.rest.pulls.createReview({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: pr.number,
            event: 'COMMENT',
            comments: commentsForReview
        });
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();