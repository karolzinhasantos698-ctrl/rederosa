(() => {
    'use strict';
    const configurada = window.REDE_ROSA_API_URL || document.querySelector('meta[name="api-url"]')?.content;
    const host = location.hostname || 'localhost';
    const base = configurada || (location.protocol === 'https:' || location.port === '8080'
        ? location.origin : 'http://' + host + ':8080');
    const api = base.replace(/\/+$/, '');
    async function request(caminho, { method = 'GET', body, autenticada = true, keepalive = false } = {}) {
        const token = window.RedeRosaUsuario?.ler()?.token;
        if (autenticada && !token) { const erro = new Error('Entre novamente na sua conta para continuar.'); erro.status = 401; throw erro; }
        const controle = new AbortController(), tempo = setTimeout(() => controle.abort(), 15000);
        try {
            const headers = {};
            if (autenticada) headers.Authorization = 'Bearer ' + token;
            if (body !== undefined) headers['Content-Type'] = 'application/json';
            const resposta = await fetch(api + caminho, { method, headers, body:body === undefined ? undefined : JSON.stringify(body), signal:controle.signal, cache:'no-store', keepalive });
            const texto = await resposta.text();
            let dados = null;
            try { if (texto) dados = JSON.parse(texto); } catch { throw new Error('O servidor enviou uma resposta inválida. Tente novamente.'); }
            if (!resposta.ok) { const erro = new Error(dados?.mensagem || 'Não foi possível concluir esta ação.'); erro.status = resposta.status; throw erro; }
            return dados;
        } catch (erro) {
            if (erro.name === 'AbortError') throw new Error('O servidor demorou para responder. Tente novamente.');
            if (erro instanceof TypeError) throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
            throw erro;
        } finally { clearTimeout(tempo); }
    }
    window.RedeRosaAPI = { base:api, request };
})();
