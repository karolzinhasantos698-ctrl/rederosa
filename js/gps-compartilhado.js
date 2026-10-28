(() => {
    'use strict';
    class GPSCompartilhado {
        constructor(api) {
            this.api = api;
            this.mapa = new MapaAcompanhamento('mapaTempoReal','atualizacaoMapa','centralizarMapa');
            this.ativo = null; this.watch = null; this.pendente = null; this.enviando = false;
            this.ultimoEnvio = 0; this.geracao = 0; this.desejado = false; this.busca = false;
            this.status = document.getElementById('statusGPS');
            document.getElementById('ativarGPS').addEventListener('click', () => { this.pausado(false); if (this.watch !== null) this.obterNovaPosicao(); else this.iniciar(); });
            document.getElementById('pausarGPS').addEventListener('click', () => { this.pausado(true); this.parar(true); this.aviso('Compartilhamento pausado. A pessoa verá apenas a última posição.', false); });
            setInterval(() => this.enviar(), 3000);
            setInterval(() => this.obterNovaPosicao(), 10000);
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) this.parar(true, true);
                else if (this.desejado && !this.pausado()) this.iniciar();
            });
            window.addEventListener('pagehide', () => this.parar(true, true));
            window.addEventListener('online', () => { if (this.desejado) this.obterNovaPosicao(); });
            window.addEventListener('offline', () => { this.mapa.conexao(false); this.aviso('Sem conexão. A nova posição só aparecerá para a pessoa quando o envio voltar a funcionar.', true); });
        }
        chave() { return 'gpsPausado:' + (window.RedeRosaUsuario?.ler()?.id || '') + ':' + (this.ativo?.id || 'preview'); }
        pausado(valor) {
            try {
                if (valor === undefined) return localStorage.getItem(this.chave()) === '1';
                if (valor) localStorage.setItem(this.chave(),'1'); else localStorage.removeItem(this.chave());
            } catch { return false; }
            return valor;
        }
        aviso(texto, erro) { if (this.status.textContent !== texto) this.status.textContent = texto; this.status.className = 'gps-mensagem ' + (erro ? 'erro' : 'sucesso'); }
        vincular(dados) {
            const anterior = this.ativo?.id;
            this.ativo = dados;
            if (dados) {
                this.mapa.conexao(true); this.mapa.atualizar(dados.localizacao, dados.estado, dados.agora);
                if (anterior !== dados.id) {
                    this.parar(false); this.ultimoEnvio = 0;
                    if (!this.pausado()) this.iniciar();
                    else this.aviso('Compartilhamento pausado por você. Toque em Retomar localização para voltar a enviar.', false);
                }
            } else if (anterior) this.parar(false);
        }
        encerrar(dados) { this.mapa.atualizar(dados.localizacao, dados.estado, dados.agora); this.parar(false); this.aviso('Acompanhamento encerrado. A localização não será mais enviada.', false); }
        iniciar() {
            if (document.hidden || this.watch !== null) return;
            if (!window.isSecureContext || !navigator.geolocation) {
                this.aviso('O GPS precisa de HTTPS ou localhost e de permissão do navegador. Use um endereço HTTPS no celular.', true);
                return;
            }
            this.desejado = true;
            this.aviso(this.ativo ? 'Ativando o GPS para compartilhar sua posição pelo link…' : 'Ativando sua localização. O envio para outra pessoa começa ao iniciar um acompanhamento.', false);
            document.getElementById('ativarGPS').textContent = 'Atualizar GPS';
            document.getElementById('pausarGPS').hidden = false;
            const geracao = this.geracao;
            this.watch = navigator.geolocation.watchPosition(posicao => {
                if (geracao === this.geracao && this.desejado && !document.hidden) this.receber(posicao);
            }, erro => {
                if (geracao === this.geracao) this.erroGPS(erro);
            }, { enableHighAccuracy:true, timeout:15000, maximumAge:0 });
        }
        receber(posicao) {
            const { latitude, longitude, accuracy } = posicao.coords;
            if (![latitude,longitude,accuracy].every(Number.isFinite)) return;
            const ponto = { latitude, longitude, precisao:accuracy, coletadaEm:new Date(posicao.timestamp || Date.now()).toISOString() };
            this.mapa.mostrar(ponto);
            if (!this.ativo) { this.aviso('Sua posição está no mapa. Ao iniciar, ela será compartilhada com quem receber o link.', false); return; }
            if (!this.pendente || new Date(ponto.coletadaEm) > new Date(this.pendente.coletadaEm)) this.pendente = ponto;
            this.enviar();
        }
        obterNovaPosicao() {
            if (!this.desejado || document.hidden || this.watch === null || this.busca) return;
            this.busca = true;
            const geracao = this.geracao;
            navigator.geolocation.getCurrentPosition(posicao => {
                this.busca = false;
                if (geracao === this.geracao && this.desejado && !document.hidden) this.receber(posicao);
            }, erro => { this.busca = false; if (geracao === this.geracao) this.erroGPS(erro); }, { enableHighAccuracy:true, timeout:15000, maximumAge:0 });
        }
        async enviar() {
            if (!this.ativo || !this.desejado || document.hidden || !this.pendente || this.enviando || Date.now()-this.ultimoEnvio<3000) return;
            const id = this.ativo.id, geracao = this.geracao, ponto = this.pendente;
            this.pendente = null; this.enviando = true; this.ultimoEnvio = Date.now();
            try {
                const dados = await this.api.request(`/api/acompanhamentos/${id}/localizacao`, {method:'PUT',body:ponto});
                if (geracao !== this.geracao || this.ativo?.id !== id) return;
                this.mapa.conexao(true); this.mapa.atualizar(dados.localizacao,dados.estado,dados.agora);
                this.aviso('Sua posição está sendo compartilhada. Mantenha esta página aberta e visível durante o trajeto.', false);
            } catch (erro) {
                if (geracao !== this.geracao || this.ativo?.id !== id) return;
                this.mapa.conexao(false); this.aviso(erro.message + ' A pessoa está vendo a última posição recebida.', true);
                if (!this.pendente || new Date(ponto.coletadaEm)>new Date(this.pendente.coletadaEm)) this.pendente = ponto;
                if ([401,404,409].includes(erro.status)) this.parar(false);
            } finally { this.enviando = false; }
        }
        erroGPS(erro) {
            if (erro.code === 1) {
                this.parar(true);
                this.aviso('Acesso à localização negado. Permita o GPS nas configurações do site e toque em Retomar localização.', true);
            } else this.aviso('O GPS está sem posição recente. Verifique a localização do aparelho; vamos tentar novamente.', true);
        }
        parar(avisarServidor, manterDesejado = false) {
            this.geracao++;
            if (this.watch !== null) navigator.geolocation.clearWatch(this.watch);
            this.watch = null; this.pendente = null; this.busca = false;
            if (!manterDesejado) this.desejado = false;
            document.getElementById('pausarGPS').hidden = true;
            document.getElementById('ativarGPS').textContent = 'Retomar localização';
            if (avisarServidor && this.ativo) {
                const id = this.ativo.id;
                this.api.request(`/api/acompanhamentos/${id}/localizacao/pausar`, {method:'POST',keepalive:true}).then(dados => {
                    if (this.ativo?.id === id && this.watch === null) this.mapa.atualizar(dados.localizacao,dados.estado,dados.agora);
                }).catch(() => { /* Sem rede, a idade da última posição informa a interrupção para quem acompanha. */ });
            }
        }
    }
    window.GPSCompartilhado = GPSCompartilhado;
})();
