/* Mapa compartilhado por check-in e página pública. Leaflet 1.9.4, licença BSD-2-Clause. */
(() => {
    'use strict';
    class MapaAcompanhamento {
        constructor(id, statusId, centralizarId) {
            this.elemento = document.getElementById(id);
            this.status = document.getElementById(statusId);
            this.posicao = null; this.feed = null; this.estado = null; this.offset = 0;
            this.conectado = true; this.seguir = true;
            if (!window.L) { this.status.textContent = 'Não foi possível carregar o mapa. Atualize a página.'; return; }
            this.mapa = L.map(this.elemento, { scrollWheelZoom:false }).setView([-14.2,-51.9], 4);
            const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
            }).addTo(this.mapa);
            let erroTiles = false;
            tiles.on('tileerror', () => { erroTiles = true; this.elemento.dataset.tiles = 'indisponivel'; });
            tiles.on('tileload', () => { if (erroTiles) this.elemento.dataset.tiles = 'ok'; });
            this.mapa.on('dragstart', () => { this.seguir = false; });
            document.getElementById(centralizarId)?.addEventListener('click', () => {
                this.seguir = true;
                if (this.posicao) this.mapa.setView([this.posicao.latitude,this.posicao.longitude], Math.max(this.mapa.getZoom(),16));
            });
            this.timer = setInterval(() => this.descrever(), 1000);
            this.descrever();
        }
        mostrar(posicao) {
            if (!this.mapa || !posicao || !Number.isFinite(posicao.latitude) || !Number.isFinite(posicao.longitude)) return;
            if (this.posicao && new Date(posicao.coletadaEm) <= new Date(this.posicao.coletadaEm)) return;
            const primeira = !this.posicao;
            this.posicao = posicao;
            const ponto = [posicao.latitude,posicao.longitude];
            if (!this.marcador) {
                this.precisao = L.circle(ponto,{radius:Math.max(1,posicao.precisao),color:'#bd3469',weight:1,fillOpacity:.09}).addTo(this.mapa);
                this.marcador = L.circleMarker(ponto,{radius:9,color:'#fff1f6',weight:3,fillColor:'#bd3469',fillOpacity:1}).addTo(this.mapa);
            } else { this.marcador.setLatLng(ponto); this.precisao.setLatLng(ponto).setRadius(Math.max(1,posicao.precisao)); }
            if (primeira) this.mapa.setView(ponto,16);
            else if (this.seguir) this.mapa.panTo(ponto,{animate:true,duration:.6});
            this.elemento.dataset.latitude = String(posicao.latitude);
            this.elemento.dataset.longitude = String(posicao.longitude);
            requestAnimationFrame(() => this.mapa.invalidateSize());
        }
        atualizar(feed, estado, agora) {
            this.feed = feed; this.estado = estado;
            if (agora) this.offset = new Date(agora).getTime() - Date.now();
            if (feed) this.mostrar(feed);
            this.descrever();
        }
        conexao(valor) { this.conectado = valor; this.descrever(); }
        descrever() {
            if (!this.status) return;
            const p = this.feed;
            this.status.className = 'mapa-atualizacao';
            if (!p) { this.status.textContent = 'Aguardando a primeira localização compartilhada.'; return; }
            const idade = Math.max(0,Math.floor((Date.now()+this.offset-Math.min(new Date(p.coletadaEm).getTime(), new Date(p.recebidaEm || p.coletadaEm).getTime()))/1000));
            const tempo = idade < 60 ? `${idade} s` : `${Math.floor(idade/60)} min`;
            const horario = new Date(p.coletadaEm).toLocaleTimeString('pt-BR');
            const detalhes = `Última posição às ${horario}, há ${tempo}. Precisão aproximada: ${Math.round(p.precisao)} m.`;
            if (['CONFIRMADO','CANCELADO'].includes(this.estado)) {
                this.status.textContent = 'Acompanhamento encerrado. ' + detalhes;
            } else if (!this.conectado) {
                this.status.classList.add('mapa-antigo'); this.status.textContent = 'Sem conexão com o servidor. ' + detalhes;
            } else if (!p.compartilhando) {
                this.status.classList.add('mapa-antigo'); this.status.textContent = 'Compartilhamento pausado. ' + detalhes;
            } else if (idade > 30) {
                this.status.classList.add('mapa-antigo'); this.status.textContent = 'Sem posição recente. A página ou o GPS da usuária pode estar pausado. ' + detalhes;
            } else {
                this.status.classList.add('mapa-recente'); this.status.textContent = 'Localização recente. ' + detalhes;
            }
            this.elemento.dataset.frescor = ['CONFIRMADO','CANCELADO'].includes(this.estado) ? 'encerrado' : !p.compartilhando ? 'pausado' : idade > 30 || !this.conectado ? 'antigo' : 'recente';
        }
    }
    window.MapaAcompanhamento = MapaAcompanhamento;
})();
