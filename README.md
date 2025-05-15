# Auto Form Submit

Sistema em Node.js para leitura de planilhas `.xlsx` e preenchimento automático de formulários web com os dados da planilha.

## Requisitos

- Node.js (v16 ou superior recomendado)
- npm (gerenciador de pacotes)

## Instalação

1. Clone ou extraia o projeto:

```bash
unzip auto-form-submit.zip
cd auto-form-submit
```

2. Instale as dependências:

```bash
npm install
```

## Uso

1. Inicie o servidor:

```bash
npm start
```

2. Acesse a interface web no navegador:

```
http://localhost:3000
```

3. Na página:
   - Faça upload da planilha `.xlsx`
   - Informe o link do formulário de destino (já vem preenchido com um exemplo)
   - Clique em **Processar**

O sistema abrirá um navegador (via Puppeteer) e irá preencher os dados de cada linha da planilha no formulário indicado.

## Observações

- O navegador será executado visivelmente (`headless: false`) para facilitar a depuração. Altere para `true` em produção.
- Os campos devem ser ajustados conforme os `name` ou `id` do formulário de destino.

## Estrutura da Planilha Esperada

A planilha deve conter pelo menos as colunas com os seguintes nomes:

- `Nome completo`
- `E-mail`
- `Celular`

Outras colunas podem ser adicionadas conforme necessidade e ajustadas no código.

---

Desenvolvido para automação de cadastros por planilha.