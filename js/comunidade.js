(() => {
    'use strict';
    const el = id => document.getElementById(id), api = window.RedeRosaAPI;
    const icones = {'apoio-emocional':'♡','direitos-das-mulheres':'⚖','seguranca':'🛡'};
    let sessaoExpirada = false;
    let salas = [], sala = null, geracao = 0, consultando = false, carregando = false, anteriores = false;
    let ultimoRecebido = 0, primeiroCarregado = null, temAnteriores = false, novas = 0;
    const mensagens = new Map(), envios = new Set(), reportadas = new Set();
    let alvoDenuncia = null, enviandoDenuncia = false;
    const usuario = () => window.RedeRosaUsuario.ler();
    const autenticada = () => !!usuario()?.token && !sessaoExpirada;
    const chaveDraft = (id = sala?.id) => 'comunidade:rascunho:' + (usuario()?.id || '') + ':' + id;
    function aviso(texto, tipo = '') { el('avisoConversa').textContent = texto; el('avisoConversa').className = 'aviso-conversa ' + tipo; }
    function conexao(texto, tipo = '') { el('conexaoSala').textContent = texto; el('conexaoSala').className = 'conexao-sala ' + tipo; }
    function uuid() {
        if (crypto.randomUUID) return crypto.randomUUID();
        const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6]&15)|64; bytes[8] = (bytes[8]&63)|128;
        const hex = [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
        return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
    }
    function lerDraft(chave = chaveDraft()) {
        try { const d = JSON.parse(sessionStorage.getItem(chave) || 'null'); return d && typeof d.texto==='string' ? d : null; } catch { return null; }
    }
    function guardarDraft() {
        if (!sala || !autenticada()) return;
        const anterior = lerDraft(), texto = el('texto').value;
        try {
            if (texto) sessionStorage.setItem(chaveDraft(),JSON.stringify({texto,chaveEnvio:anterior?.texto===texto ? anterior.chaveEnvio : uuid()}));
            else sessionStorage.removeItem(chaveDraft());
        } catch { /* O envio funciona mesmo sem espaço para guardar rascunhos. */ }
    }
    function atualizarEditor() {
        const pendente = sala && envios.has(chaveDraft());
        el('texto').disabled = !autenticada() || !sala || carregando || !!pendente;
        el('enviarMensagem').disabled = el('texto').disabled || !el('texto').value.trim();
        el('enviarMensagem').textContent = pendente ? 'Enviando…' : 'Enviar →';
        el('contadorMensagem').textContent = el('texto').value.length.toLocaleString('pt-BR') + ' / 2.000';
    }
    function pedirLogin(texto) {
        sessaoExpirada = true;
        el('acessoComunidade').hidden = false; el('areaConversa').hidden = true;
        mensagens.clear(); el('mensagens').replaceChildren(); atualizarEditor();
        if (texto) aviso(texto,'erro');
    }
    function desenharSalas() {
        const lista = el('listaSalas'); lista.replaceChildren();
        salas.forEach(item => {
            const botao = document.createElement('button'); botao.type='button'; botao.className='botao-sala'; botao.dataset.sala=item.id;
            botao.setAttribute('aria-pressed',String(sala?.id===item.id));
            botao.setAttribute('aria-controls','painelComunidade');botao.setAttribute('aria-expanded',String(sala?.id===item.id));
            const icone=document.createElement('span'); icone.className='icone-sala'; icone.setAttribute('aria-hidden','true'); icone.textContent=icones[item.id] || '♡';
            const copy=document.createElement('span'),titulo=document.createElement('strong'),descricao=document.createElement('small'); titulo.textContent=item.nome; descricao.textContent=item.descricao;
            copy.append(titulo,descricao);
            if(sala?.id===item.id){const ativo=document.createElement('span');ativo.className='sala-selecionada';ativo.textContent='Sala selecionada';copy.append(ativo);}
            botao.append(icone,copy);botao.addEventListener('click',()=>selecionarSala(item.id));lista.append(botao);
        });
    }
    async function carregarSalas() {
        el('recarregarSalas').disabled=true;
        try {
            salas=await api.request('/api/comunidade/salas',{autenticada:false});
            el('erroSalas').textContent='';el('recarregarSalas').hidden=true;
            if(!salas.length)throw new Error('As salas ainda não estão disponíveis. Tente novamente em instantes.');
            desenharSalas();
        } catch(erro){el('erroSalas').textContent=erro.message;el('recarregarSalas').hidden=false;el('listaSalas').replaceChildren();}
        finally{el('recarregarSalas').disabled=false;}
    }
    async function selecionarSala(id) {
        if(sala?.id===id && !carregando) { if(autenticada()) atualizarNovas(); return; }
        guardarDraft();
        sala=salas.find(s=>s.id===id);if(!sala)return;
        el('painelComunidade').hidden=false;
        geracao++;consultando=false;anteriores=false;carregando=true;
        ultimoRecebido=0;primeiroCarregado=null;temAnteriores=false;novas=0;mensagens.clear();
        el('novasMensagens').hidden=true;el('carregarAnteriores').hidden=true;
        el('tituloConversa').textContent=sala.nome;el('descricaoSala').textContent=sala.descricao;
        el('mensagens').setAttribute('aria-label','Mensagens da sala '+sala.nome);el('mensagens').replaceChildren();
        el('texto').value=lerDraft()?.texto || '';aviso('');desenharSalas();atualizarEditor();
        try{sessionStorage.setItem('comunidade:ultimaSala',id);const url=new URL(location.href);url.searchParams.set('sala',id);history.replaceState(null,'',url);}catch{}
        if(!autenticada()){carregando=false;pedirLogin();el('painelComunidade').scrollIntoView({behavior:'smooth',block:'start'});return;}
        el('acessoComunidade').hidden=true;el('areaConversa').hidden=false;
        await carregarInicial();
        if(sala?.id===id)el('painelComunidade').scrollIntoView({behavior:'smooth',block:'start'});
    }
    function fecharConversa() {
        const id=sala?.id;guardarDraft();geracao++;sala=null;consultando=false;carregando=false;anteriores=false;
        mensagens.clear();el('mensagens').replaceChildren();el('painelComunidade').hidden=true;aviso('');
        desenharSalas();atualizarEditor();
        el('listaSalas').querySelector('[data-sala="'+id+'"]')?.focus({preventScroll:true});
    }
    function vazio(texto) {
        if(mensagens.size)return;
        el('mensagens').replaceChildren();const p=document.createElement('p');p.className='conversa-vazia';p.textContent=texto;el('mensagens').append(p);
    }
    function criarMensagem(item) {
        const artigo=document.createElement('article');artigo.className='mensagem mensagem-comunidade '+(item.propria?'minha':'outra');artigo.dataset.mensagem=String(item.id);
        const cabecalho=document.createElement('div');cabecalho.className='cabecalho-mensagem';
        const nome=document.createElement('strong');nome.textContent=item.propria?'Você · '+item.autora:item.autora;
        const horario=document.createElement('time');horario.dateTime=item.criadaEm;horario.textContent=new Date(item.criadaEm).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});horario.title=new Date(item.criadaEm).toLocaleString('pt-BR');
        cabecalho.append(nome,horario);const texto=document.createElement('p');texto.className='texto-mensagem';texto.textContent=item.texto;artigo.append(cabecalho,texto);
        if(!item.propria){const rodape=document.createElement('div');rodape.className='rodape-mensagem';const botao=document.createElement('button');botao.type='button';botao.className='acao-denunciar';botao.dataset.denunciar=String(item.id);botao.textContent=reportadas.has(item.id)?'Denúncia registrada':'Denunciar';botao.disabled=reportadas.has(item.id);botao.addEventListener('click',()=>abrirDenuncia(item));rodape.append(botao);artigo.append(rodape);}
        return artigo;
    }
    function adicionar(itens,{antigas=false,forcarFundo=false}={}) {
        const caixa=el('mensagens'),altura=caixa.scrollHeight,topo=caixa.scrollTop;
        const estavaNoFundo=altura-topo-caixa.clientHeight<90;
        const novos=itens.filter(item=>item.sala===sala?.id&&!mensagens.has(item.id));
        if(!novos.length)return;
        caixa.querySelector('.conversa-vazia')?.remove();
        novos.sort((a,b)=>a.id-b.id).forEach(item=>{
            mensagens.set(item.id,item);
            const referencia=[...caixa.children].find(e=>Number(e.dataset.mensagem)>item.id);
            caixa.insertBefore(criarMensagem(item),referencia || null);
        });
        primeiroCarregado=Math.min(...mensagens.keys());
        if(antigas)caixa.scrollTop=topo+caixa.scrollHeight-altura;
        else if(estavaNoFundo||forcarFundo){caixa.scrollTop=caixa.scrollHeight;novas=0;el('novasMensagens').hidden=true;}
        else{novas+=novos.length;el('novasMensagens').textContent=`${novas} nova${novas===1?' mensagem':'s mensagens'} ↓`;el('novasMensagens').hidden=false;}
    }
    async function carregarInicial() {
        if(!sala)return;
        if(!autenticada()){pedirLogin();return;}
        const atual=geracao,id=sala.id;carregando=true;atualizarEditor();conexao('Carregando a conversa…');el('mensagens').setAttribute('aria-busy','true');
        try{
            const pagina=await api.request(`/api/comunidade/salas/${id}/mensagens`);
            if(atual!==geracao)return;
            adicionar(pagina.mensagens,{forcarFundo:true});ultimoRecebido=pagina.ultimoId||0;temAnteriores=pagina.temAnteriores;el('carregarAnteriores').hidden=!temAnteriores;
            vazio('A conversa começa com você. Escreva a primeira mensagem.');conexao('Conectada à sala · atualização automática','conectada');
        }catch(erro){if(atual!==geracao)return;if(erro.status===401)pedirLogin(erro.message);else{vazio('Não foi possível carregar. Toque em Atualizar para tentar novamente.');conexao('Sem atualização no momento','falha');aviso(erro.message,'erro');}}
        finally{if(atual===geracao){carregando=false;el('mensagens').setAttribute('aria-busy','false');atualizarEditor();}}
    }
    async function atualizarNovas() {
        if(!autenticada()||!sala||consultando||carregando)return;
        const atual=geracao,id=sala.id;consultando=true;
        try{
            let mais=false,paginas=0;
            do{
                const pagina=await api.request(`/api/comunidade/salas/${id}/mensagens?apos=${ultimoRecebido}`);
                if(atual!==geracao)return;
                adicionar(pagina.mensagens);ultimoRecebido=Math.max(ultimoRecebido,pagina.ultimoId||0);mais=pagina.temMais;
            }while(mais&&++paginas<5);
            vazio('A conversa começa com você. Escreva a primeira mensagem.');conexao('Conectada à sala · atualização automática','conectada');
        }catch(erro){if(atual!==geracao)return;if(erro.status===401)pedirLogin(erro.message);else conexao('Sem atualização. Mostrando as últimas mensagens recebidas.','falha');}
        finally{if(atual===geracao)consultando=false;}
    }
    async function carregarAnteriores() {
        if(!sala||!primeiroCarregado||!temAnteriores||anteriores)return;
        const atual=geracao,id=sala.id;anteriores=true;el('carregarAnteriores').disabled=true;
        try{
            const pagina=await api.request(`/api/comunidade/salas/${id}/mensagens?antes=${primeiroCarregado}`);
            if(atual!==geracao)return;
            adicionar(pagina.mensagens,{antigas:true});temAnteriores=pagina.temAnteriores;el('carregarAnteriores').hidden=!temAnteriores;
        }catch(erro){if(atual===geracao)aviso(erro.message,'erro');}
        finally{if(atual===geracao){anteriores=false;el('carregarAnteriores').disabled=false;}}
    }
    async function enviar(event) {
        event.preventDefault();if(!sala||!autenticada()||carregando)return;
        const texto=el('texto').value;if(!texto.trim()||texto.length>2000)return;
        const atual=geracao,id=sala.id,chave=chaveDraft();if(envios.has(chave))return;
        guardarDraft();const draft=lerDraft(chave);const envio={texto,chaveEnvio:draft?.texto===texto&&draft.chaveEnvio?draft.chaveEnvio:uuid()};
        try{sessionStorage.setItem(chave,JSON.stringify(envio));}catch{}
        envios.add(chave);atualizarEditor();aviso('');
        try{
            const criada=await api.request(`/api/comunidade/salas/${id}/mensagens`,{method:'POST',body:envio});
            try{sessionStorage.removeItem(chave);}catch{}
            if(atual!==geracao)return;
            adicionar([criada],{forcarFundo:true});el('texto').value='';
            // O cursor só avança com GET: a resposta do próprio envio pode pular
            // mensagens de outras pessoas que ainda não chegaram nesta página.
            await atualizarNovas();conexao('Mensagem enviada · atualização automática','conectada');
        }catch(erro){if(atual!==geracao)return;if(erro.status===401)pedirLogin(erro.message);else aviso(erro.message+' Seu texto continua aqui para tentar novamente.','erro');}
        finally{envios.delete(chave);if(atual===geracao){atualizarEditor();if(!el('texto').disabled)el('texto').focus();}}
    }
    function abrirDenuncia(item){alvoDenuncia={item,sala:sala.id};el('resumoDenuncia').textContent=item.autora+': '+item.texto.slice(0,180);el('motivoDenuncia').value='';el('avisoDenuncia').textContent='';el('dialogDenuncia').showModal();el('motivoDenuncia').focus();}
    async function denunciar(event){
        event.preventDefault();if(!alvoDenuncia||enviandoDenuncia)return;
        const motivo=el('motivoDenuncia').value.trim();if(!motivo)return;
        const alvo=alvoDenuncia;enviandoDenuncia=true;el('enviarDenuncia').disabled=true;el('cancelarDenuncia').disabled=true;
        try{
            await api.request(`/api/comunidade/salas/${alvo.sala}/mensagens/${alvo.item.id}/denuncias`,{method:'POST',body:{motivo}});
            reportadas.add(alvo.item.id);const botao=el('mensagens').querySelector(`[data-denunciar="${alvo.item.id}"]`);if(botao){botao.disabled=true;botao.textContent='Denúncia registrada';}
            el('dialogDenuncia').close();aviso('Denúncia registrada.','sucesso');
        }catch(erro){el('avisoDenuncia').textContent=erro.message;}
        finally{enviandoDenuncia=false;el('enviarDenuncia').disabled=false;el('cancelarDenuncia').disabled=false;}
    }
    function mensagemRosa(nome,texto,minha=false){const a=document.createElement('article');a.className='mensagem '+(minha?'minha':'outra');const n=document.createElement('strong'),p=document.createElement('p');n.textContent=nome;p.textContent=texto;a.append(n,p);el('mensagensRosa').append(a);el('mensagensRosa').scrollTop=el('mensagensRosa').scrollHeight;}
    async function conversarRosa(event){
        event.preventDefault();const texto=el('textoRosa').value.trim();if(!texto||el('enviarRosa').disabled)return;
        el('enviarRosa').disabled=true;el('avisoRosa').textContent='';mensagemRosa('Você',texto,true);el('textoRosa').value='';
        const controle=new AbortController(),tempo=setTimeout(()=>controle.abort(),25000);
        try{const resposta=await fetch(api.base+'/chat',{method:'POST',headers:{'Content-Type':'text/plain'},body:texto,signal:controle.signal});const conteudo=await resposta.text();if(!resposta.ok||/^erro\b/i.test(conteudo)||!conteudo.trim())throw new Error();mensagemRosa('Rosa · assistente virtual',conteudo);}
        catch{el('avisoRosa').textContent='A Rosa está indisponível no momento. Você pode tentar novamente ou abrir uma sala da comunidade.';}
        finally{clearTimeout(tempo);el('enviarRosa').disabled=false;}
    }
    el('fecharConversa').addEventListener('click',fecharConversa);
    el('formMensagem').addEventListener('submit',enviar);el('texto').addEventListener('input',()=>{guardarDraft();atualizarEditor();});
    el('texto').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!el('enviarMensagem').disabled)el('formMensagem').requestSubmit();}});
    el('atualizarSala').addEventListener('click',()=>{if(!sala){carregarSalas();return;}if(!mensagens.size)carregarInicial();else atualizarNovas();});
    el('carregarAnteriores').addEventListener('click',carregarAnteriores);el('recarregarSalas').addEventListener('click',carregarSalas);
    el('novasMensagens').addEventListener('click',()=>{el('mensagens').scrollTop=el('mensagens').scrollHeight;novas=0;el('novasMensagens').hidden=true;});
    el('mensagens').addEventListener('scroll',()=>{const c=el('mensagens');if(c.scrollHeight-c.scrollTop-c.clientHeight<80){novas=0;el('novasMensagens').hidden=true;}});
    el('formDenuncia').addEventListener('submit',denunciar);el('cancelarDenuncia').addEventListener('click',()=>el('dialogDenuncia').close());el('dialogDenuncia').addEventListener('cancel',event=>{if(enviandoDenuncia)event.preventDefault();});
    el('formRosa').addEventListener('submit',conversarRosa);
    window.addEventListener('online',atualizarNovas);document.addEventListener('visibilitychange',()=>{if(!document.hidden)atualizarNovas();});
    window.addEventListener('storage',event=>{if(event.key==='usuario'||event.key===null){sessaoExpirada=false;geracao++;consultando=false;mensagens.clear();if(sala){const id=sala.id;sala=null;selecionarSala(id);}}});
    setInterval(()=>{if(!document.hidden)atualizarNovas();},3000);
    carregarSalas();
})();
