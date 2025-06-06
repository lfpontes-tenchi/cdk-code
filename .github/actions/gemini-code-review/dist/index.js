/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 918:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 74:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 498:
/***/ ((module) => {

module.exports = eval("require")("@google/generative-ai");


/***/ }),

/***/ 389:
/***/ ((module) => {

module.exports = eval("require")("axios");


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
const core = __nccwpck_require__(918);
const github = __nccwpck_require__(74);
const { GoogleGenerativeAI } = __nccwpck_require__(498);
const axios = __nccwpck_require__(389);

async function run() {
  try {
    // 1. Obter Entradas
    const githubToken = core.getInput('github-token');
    const geminiApiKey = core.getInput('gemini-api-key');

    // 2. Inicializar Clientes
    const octokit = github.getOctokit(githubToken);
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

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
module.exports = __webpack_exports__;
/******/ })()
;