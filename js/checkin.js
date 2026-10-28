(() => {
    'use strict';
    const el = id => document.getElementById(id);
    const api = window.RedeRosaAPI;
    const gps = new GPSCompartilhado(api);
    const textos = {
        AGUARDANDO: ['aguardando', '◷', 'Aguardando sua confirmação'],
        ATRASADO: ['atrasado', '!', 'O prazo terminou sem confirmação'],
        CONFIRMADO: ['confirmado', '✓', 'Confirmou que está bem'],
        CANCELADO: ['cancelado', '—', 'Encerrado sem confirmação']
    };
    let ativo = null, diferencaRelogio = 0, ocupado = false, consultando = false, versao = 0;
    const formatar = valor => new Date(valor).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    function mensagem(texto, tipo = '') { el('mensagem').textContent = texto; el('mensagem').className = 'acompanhamento-mensagem ' + tipo; }
    function contaValida() { return !!window.RedeRosaUsuario.ler()?.token; }
    function pedirLogin() {
        gps.vincular(null); ativo = null; el('acesso').hidden = false; el('iniciarForm').hidden = true; el('ativo').hidden = true;
        el('carregando').hidden = true; el('tentarNovamente').hidden = true;
    }
    function renderizar() {
        if (!contaValida()) { pedirLogin(); return; }
        el('acesso').hidden = true; el('carregando').hidden = true;
        el('iniciarForm').hidden = !!ativo; el('ativo').hidden = !ativo;
        if (!ativo) return;
        const config = textos[ativo.estado];
        if (!config) throw new Error('O servidor retornou um estado desconhecido.');
        el('estadoAtivo').className = 'acompanhamento-estado ' + config[0];
        el('iconeEstado').textContent = config[1]; el('textoEstado').textContent = config[2];
        el('prazoAtivo').textContent = formatar(ativo.prazo);
        el('tituloAtivo').textContent = ativo.estado === 'ATRASADO' ? 'Como você está?' : 'Seu acompanhamento está ativo';
        const url = new URL(ativo.urlAcompanhamento);
        if (!['http:','https:'].includes(url.protocol)) throw new Error('O endereço de acompanhamento não é válido.');
        const mensagemWhatsApp = `Oi! Você pode me acompanhar? Vou confirmar que estou bem até ${formatar(ativo.prazo)}. Confira por este link: ${url.href}`;
        el('compartilhar').href = 'https://wa.me/?text=' + encodeURIComponent(mensagemWhatsApp);
        el('abrirPublico').href = url.href; el('linkManual').value = url.href;
        const local = ['localhost','127.0.0.1','[::1]','0.0.0.0'].includes(url.hostname);
        el('avisoRede').hidden = !local;
        el('avisoRede').textContent = 'Este link funciona apenas neste computador. Para alguém acompanhar em outro aparelho, abra o projeto por um endereço de rede ou configure um endereço público do servidor.';
        el('compartilhar').setAttribute('aria-disabled', String(local));
        el('compartilhar').tabIndex = local ? -1 : 0;
        contar();
    }
    function contar() {
        if (!ativo) return;
        const segundos = Math.ceil((new Date(ativo.prazo).getTime() - (Date.now() + diferencaRelogio)) / 1000);
        el('contagem').textContent = segundos <= 0
            ? 'Confirme que está bem ou peça mais tempo.'
            : `${Math.floor(segundos / 60)} min e ${String(segundos % 60).padStart(2,'0')} s restantes`;
    }
    function atualizarAtivo(dados) {
        ativo = dados;
        gps.vincular(dados);
        if (dados) diferencaRelogio = new Date(dados.agora).getTime() - Date.now();
        renderizar();
    }
    async function historico() {
        try {
            const lista = await api.request('/api/acompanhamentos/historico');
            const container = el('historicoAcompanhamentos'); container.replaceChildren();
            if (!lista.length) { const p = document.createElement('p'); p.textContent = 'Seus acompanhamentos aparecerão aqui.'; container.append(p); return; }
            lista.forEach(item => {
                const config = textos[item.estado]; if (!config) return;
                const card = document.createElement('article'); card.className = 'registro-acompanhamento';
                const estado = document.createElement('span'); estado.className = 'marcador ' + config[0]; estado.textContent = config[2];
                const inicio = document.createElement('p'); inicio.textContent = 'Iniciado em ' + formatar(item.inicio);
                const prazo = document.createElement('p'); prazo.textContent = 'Horário combinado: ' + formatar(item.prazo);
                card.append(estado, inicio, prazo);
                if (item.encerradoEm) { const fim = document.createElement('p'); fim.textContent = 'Encerrado em ' + formatar(item.encerradoEm); card.append(fim); }
                if (new Date(item.expiraEm).getTime() > new Date(item.agora).getTime()) {
                    const link = document.createElement('a'); link.href = item.urlAcompanhamento; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Ver acompanhamento ↗'; card.append(link);
                }
                container.append(card);
            });
        } catch { el('historicoAcompanhamentos').textContent = 'Não foi possível atualizar o histórico agora.'; }
    }
    async function atualizar(comHistorico = false) {
        if (ocupado || consultando) return;
        if (!contaValida()) { pedirLogin(); return; }
        const atual = versao; consultando = true;
        try {
            const dados = await api.request('/api/acompanhamentos/ativo');
            if (atual !== versao) return;
            atualizarAtivo(dados.acompanhamento); el('tentarNovamente').hidden = true;
            if (comHistorico) await historico();
        } catch (erro) {
            if (atual !== versao) return;
            el('carregando').hidden = true;
            if (erro.status === 401) pedirLogin();
            mensagem(erro.message + (ativo ? ' O estado exibido é a última informação recebida.' : ''), 'erro');
            el('tentarNovamente').hidden = erro.status === 401;
        } finally { consultando = false; }
    }
    function bloquear(valor) {
        ocupado = valor;
        ['iniciar','confirmar','estender','cancelar'].forEach(id => { el(id).disabled = valor; });
    }
    async function iniciar(event) {
        event.preventDefault(); if (ocupado) return;
        versao++; bloquear(true); mensagem('Iniciando seu acompanhamento…');
        try {
            const dados = await api.request('/api/acompanhamentos', { method:'POST', body:{ minutos:Number(new FormData(el('iniciarForm')).get('minutos')), telefone:el('telefone').value.trim() || null } });
            atualizarAtivo(dados); mensagem('Acompanhamento iniciado. Agora envie o link para alguém de confiança.', 'sucesso');
            await historico();
        } catch (erro) {
            mensagem(erro.message, 'erro'); if (erro.status === 401) pedirLogin();
            if (erro.status === 409 || !erro.status) { bloquear(false); await atualizar(true); if (ativo) mensagem('Seu acompanhamento está salvo. Envie o link para alguém de confiança.', 'sucesso'); }
        } finally { bloquear(false); }
    }
    async function alterar(acao) {
        if (ocupado || !ativo) return;
        if (acao === 'cancelar' && !confirm('Encerrar sem confirmar que está bem? A pessoa verá o acompanhamento como cancelado.')) return;
        const id = ativo.id; versao++; bloquear(true); mensagem('Atualizando seu acompanhamento…');
        try {
            const dados = await api.request(`/api/acompanhamentos/${id}/${acao}`, { method:'POST', ...(acao === 'estender' ? {body:{minutos:15}} : {}) });
            if (acao === 'estender') {
                atualizarAtivo(dados); mensagem('Mais 15 minutos adicionados. O mesmo link mostra o novo horário.', 'sucesso');
            } else {
                gps.encerrar(dados);
                atualizarAtivo(null);
                mensagem(acao === 'confirmar' ? 'Você confirmou que está bem! A pessoa já pode ver sua confirmação no link.' : 'Acompanhamento cancelado. O link informa que não houve confirmação.', 'sucesso');
            }
            await historico();
        } catch (erro) {
            mensagem(erro.message, 'erro'); if (erro.status === 401) pedirLogin();
        } finally { bloquear(false); }
    }
    async function copiar() {
        if (!ativo) return;
        try {
            if (!navigator.clipboard?.writeText) throw new Error();
            await navigator.clipboard.writeText(ativo.urlAcompanhamento);
            mensagem('Link copiado. Envie para a pessoa que vai acompanhar.', 'sucesso');
        } catch {
            el('linkManual').hidden = false; el('linkManual').focus(); el('linkManual').select();
            mensagem('Selecione e copie o link abaixo para compartilhar.');
        }
    }
    function legado() {
        try {
            const registros = JSON.parse(localStorage.getItem('checkins') || '[]');
            if (!Array.isArray(registros) || !registros.length) return;
            el('legado').hidden = false;
            registros.slice(0,20).forEach(item => {
                const data = new Date(typeof item === 'string' ? item : item?.dataHora);
                if (Number.isNaN(data.getTime())) return;
                const p = document.createElement('p'); p.textContent = 'Check-in em ' + formatar(data); el('historicoLegado').append(p);
            });
        } catch { /* Um histórico local inválido não impede iniciar um acompanhamento. */ }
    }
    el('iniciarForm').addEventListener('submit', iniciar);
    ['confirmar','estender','cancelar'].forEach(acao => el(acao).addEventListener('click', () => alterar(acao)));
    el('copiar').addEventListener('click', copiar);
    el('tentarNovamente').addEventListener('click', () => atualizar(true));
    window.addEventListener('storage', event => { if (event.key === 'usuario' || event.key === null) { versao++; atualizar(true); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizar(true); });
    window.addEventListener('online', () => atualizar(true));
    setInterval(() => { if (!document.hidden) atualizar(); }, 5000); setInterval(contar, 1000);
    legado(); atualizar(true);
})();
