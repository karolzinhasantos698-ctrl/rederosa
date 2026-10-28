/* Dados usados nas saudações; o nome sempre vem da conta, nunca do e-mail. */
window.RedeRosaUsuario = {
    normalizar(dados) {
        if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
        const conta = dados.usuaria || dados.usuario || dados.data?.usuaria || dados.data?.usuario || dados;
        if (!conta || typeof conta !== "object" || Array.isArray(conta)) return null;
        const nome = [conta.nome, conta.name, conta.nomeCompleto, dados.nome, dados.name]
            .find(valor => typeof valor === "string" && valor.trim());
        return { ...conta, nome: nome ? nome.trim().replace(/\s+/g, " ") : "" };
    },
    ler() {
        try {
            return this.normalizar(JSON.parse(localStorage.getItem("usuario") || "null"));
        } catch {
            return null;
        }
    }
};
