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

      **Your task:**
      1.  **Security First:** Prioritize the identification of security vulnerabilities such as SQL Injection, Cross-Site Scripting (XSS), insecure direct object references, sensitive data exposure, command injection, etc.
      2.  **Code Quality:** Also, identify potential bugs, logic errors, performance issues, and opportunities to improve readability and maintainability. Follow best practices for the language in the diff.
      3.  **Provide a response in a valid JSON format only.** Do not add any text or markdown formatting before or after the JSON object.
      4.  The JSON object must be an array of "comment" objects.
      5.  Each "comment" object must contain three keys:
          * \`"filePath"\`: The full path of the file being commented on (e.g., "src/user/service.js").
          * \`"lineNumber"\`: The specific line number in the new version of the file that the comment applies to. This must be a number.
          * \`"commentBody"\`: A concise and clear review comment in Markdown format. Explain the issue and suggest a fix. Start the comment with a relevant emoji (e.g., 🔐 for security, 🐛 for bug, ✨ for improvement, 📖 for readability).

      **If no issues are found, you MUST return an empty JSON array: \`[]\`.**

      Here is the diff:
      \`\`\`diff
      ${diff}
      \`\`\`
    `;

    // 6. Chamar a API do Gemini e Processar a Resposta
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    
    let reviewComments;
    try {
      reviewComments = JSON.parse(jsonText);
    } catch(e) {
      console.error("Failed to parse JSON response from Gemini:", jsonText);
      core.setFailed("Could not parse the JSON response from the AI model.");
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