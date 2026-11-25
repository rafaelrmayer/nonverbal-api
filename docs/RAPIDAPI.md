# Publicação da Nonverbal API no RapidAPI

**Estado em 25/11/2026:** o responsável confirmou a publicação da [Nonverbal API no RapidAPI](https://rapidapi.com/RafaelMayer/api/nonverbal-api) e enviou a captura da listagem, com Basic a US$ 0 e categoria Artificial Intelligence/Machine Learning. O Basic “Deprecated” exibido na conta é uma versão anterior do plano, não uma segunda API.

O segredo foi configurado no Render: o responsável confirmou 200 pelo gateway e mostrou `gateway_unauthorized` no acesso direto protegido. O [workflow de conferência](https://github.com/rafaelrmayer/nonverbal-api/actions/runs/45678813778) terminou com sucesso e seus logs registram 200 nas cinco operações (health, models, body, face e vocal), usando imagem branca e WAV silencioso. Nenhuma nova chamada ao gateway foi necessária para registrar esse resultado.

**Host consumidor confirmado:** `nonverbal-api.p.rapidapi.com` (sem número adicional). A Base URL de origem segue sendo `https://nonverbal-api.onrender.com/rapidapi`. Os dois endereços têm funções diferentes.

Os detalhes de quota e taxa de banda não aparecem na captura enviada. A seção de plano abaixo mantém os valores definidos para o piloto como referência de configuração; conferir sua exibição no Pricing. A execução bem-sucedida da conta proprietária não verifica cotas de uma conta consumidora, carga ou disponibilidade contínua.

## Operações importadas

Use [rapidapi/openapi.json](rapidapi/openapi.json), em OpenAPI 3.0.3, validado e derivado do contrato FastAPI. Depois do merge, a URL de importação é:

https://raw.githubusercontent.com/rafaelrmayer/nonverbal-api/main/docs/rapidapi/openapi.json

| Método | Caminho na listagem | Entrada |
| --- | --- | --- |
| GET | /health | Sem body; estado do serviço, não garantia de todos os modelos |
| GET | /v1/models | Sem body; modelos e algoritmo vocal, recursos e disponibilidade |
| POST | /v1/body/analyze | Bytes JPEG/PNG, Content-Type correspondente |
| POST | /v1/face/analyze | Bytes JPEG/PNG, Content-Type correspondente |
| POST | /v1/vocal/analyze | Bytes WAV PCM16, Content-Type audio/wav ou audio/x-wav |

Base URL de origem: **https://nonverbal-api.onrender.com/rapidapi**.

Não acrescente /rapidapi aos cinco caminhos: o prefixo já está na Base URL. Não use o endereço do painel Render. Root HTML, espelho, vídeo, mãos detalhadas, assets, Swagger e OpenAPI não são operações dessa listagem. Não existe endpoint HTTP de vídeo nem de mãos detalhadas.

## Configuração e manutenção (listagem já publicada)

1. Aguarde o deploy no Render ficar Live. O serviço e a demonstração continuam no mesmo endereço, com o health check nativo do Render em /health.
2. No RapidAPI Studio, crie o projeto **Nonverbal API**, inicialmente privado, usando a importação **OpenAPI** por arquivo ou URL acima. Confirme a presença das cinco operações e a Base URL com /rapidapi.
3. No projeto RapidAPI, procure **Hub Listing → Gateway → Firewall Settings → X-RapidAPI-Proxy-Secret**. Copie o valor diretamente para o próximo passo, sem publicá-lo. O nome/local pode variar conforme a interface.
4. No Render, serviço nonverbal-api → **Environment → Add Environment Variable**: nome `RAPIDAPI_PROXY_SECRET`, valor copiado do gateway. Use variável de ambiente, não Secret File, e salve/reimplante. Não reutilize o segredo da Neural/Girassol. Não cole o valor em chats, repositório, exemplos ou screenshots. Não é X-RapidAPI-Key.
5. Pelo RapidAPI, execute /health: deve retornar 200. Abra a origem /rapidapi/health diretamente no navegador, sem cabeçalho: deve retornar 403. Se ainda não cadastrou segredo no Render, 503 gateway_not_configured é esperado. A origem pública /health e a demonstração devem continuar acessíveis.
6. Teste /v1/models e os três POSTs. Nos POSTs, envie **arquivo binário**, não JSON, base64, URL ou multipart. JPEG/PNG precisam do Content-Type correspondente; WAV precisa ser PCM16, mono/estéreo, 8–48 kHz, até 30 s/8 MiB. Imagens: até 2 MiB/4 MP. Todos compartilham uma vaga de inferência e podem retornar 429; o rosto carrega sob demanda na primeira análise.
7. Configure o Basic e revise a página pública antes de ativar a visibilidade. Somente depois de testar pelo gateway e confirmar os dados da listagem, mude para pública. A URL final é a que o painel apresentar; não assumir que o slug já existe.

O consumidor usa sua própria X-RapidAPI-Key e X-RapidAPI-Host. O proxy acrescenta X-RapidAPI-Proxy-Secret no lado servidor; não peça esse segredo ao consumidor nem o inclua no OpenAPI. O monitor de health opcional do RapidAPI precisa enviar o segredo se usar a Base URL protegida; o teste da operação pelo gateway é distinto do health check público do Render.

## Plano do piloto: referência para conferência

Manter o mesmo recorte gratuito já usado nos outros pilotos:

- BASIC, Monthly Subscription, US$ 0/mês.
- Requests: 1.000 por mês, **Hard Limit**.
- Rate limit: 10 requisições por minuto.
- PRO/ULTRA/MEGA desativados por enquanto.

Conferir a tela pública de preço: assinatura zero não garante ausência de taxas separadas da plataforma, como banda excedente. Não anunciar “sem qualquer cobrança” se houver taxa de banda. As cotas valem no RapidAPI, não na origem pública; a conta proprietária pode ter tratamento diferente de uma conta consumidora. Estes valores são configuração do plano, não cotas aplicadas pelo código da origem.

## Teste das cinco operações via GitHub Actions

Depois do merge e da criação da listagem, abra o repositório → Settings → Secrets and variables → Actions:

- **Variable:** `NONVERBAL_RAPIDAPI_HOST`, com `nonverbal-api.p.rapidapi.com`, confirmado no snippet de getHealth; sem https://, barras ou caminho.
- **Secret:** `NONVERBAL_RAPIDAPI_KEY`, com uma chave consumidora da aplicação de teste RapidAPI. Não usar o Proxy Secret aqui.

Abra Actions → **Conferir Nonverbal no RapidAPI** → Run workflow. Faz cinco chamadas, sem reenvio automático, usando imagem branca gerada e um segundo de WAV silencioso. Espera health/modelos válidos, no_pose, no_face e pitch indeterminado em silêncio. Não envia imagens ou vozes de pessoas, não imprime credenciais e não segue redirecionamentos com a chave.

O script também pode ser usado localmente: `python -m scripts.rapidapi_smoke`, com as duas variáveis no ambiente. O workflow só roda manualmente e não transforma a listagem em pública. Um resultado aprovado verifica encaminhamento e contratos sintéticos; não valida cotas por consumidor, precisão real, carga ou disponibilidade contínua.

## Textos para a listagem

A captura enviada mostra o link de importação OpenAPI no início do API Overview. Se ele estiver no campo de descrição longa, substitua-o pelo texto abaixo. O arquivo OpenAPI é usado na importação; não substitui a apresentação do produto.

**Nome:** Nonverbal API

**Descrição curta:** API experimental de pontos corporais e faciais em imagens e medidas acústicas em WAV. Demonstração com câmera, mãos e vídeo local, sem inferir emoções ou intenções.

**Descrição longa:**

A Nonverbal API oferece três canais de análise experimental: pontos corporais e relações geométricas em JPEG/PNG, contornos faciais com medidas relativas de abertura dos olhos e da boca, e medidas acústicas de energia digital, periodicidade e intervalos de baixa energia em WAV PCM16.

Os resultados não identificam emoções, intenções, identidade, diagnóstico ou o significado de gestos. A frequência pode ficar indeterminada; baixa energia não comprova pausa de fala. Nenhuma pose/rosto e múltiplas detecções são tratados explicitamente, sem escolher uma pessoa entre múltiplos rostos ou poses.

A demonstração em https://nonverbal-api.onrender.com/ reúne câmera, mãos detalhadas, rosto, vídeos locais e áudio. Espelho e vídeo são processados no navegador; fotos e áudios só são enviados à API após ação explícita. Vídeo e mãos detalhadas pertencem à demonstração e não são endpoints HTTP do marketplace. O código não persiste as amostras; a hospedagem pode manter metadados de acesso.

Protótipo Python/FastAPI com MediaPipe, NumPy e execução WebAssembly no espelho. Limites: imagens até 2 MiB/4 MP e áudio até 8 MiB/30 segundos. Uma análise em andamento por processo. O serviço gratuito pode ter partida a frio e latência variável; não há SLA.

**Website:** https://nonverbal-api.onrender.com/

**Código:** https://github.com/rafaelrmayer/nonverbal-api

## Diagnóstico

| Resultado | Conferir |
| --- | --- |
| 503 gateway_not_configured | Variável RAPIDAPI_PROXY_SECRET ausente/vazia no ambiente implantado |
| 403 gateway_unauthorized | Segredo ausente/incorreto/repetido; consumidor deve passar pela RapidAPI |
| 404 not_found | Base URL, caminho fora da lista ou prefixo duplicado |
| 405 method_not_allowed | Método da operação e cabeçalho Allow |
| 415 | Content-Type e envio de bytes diretamente |
| 422 | JPEG/PNG estático válido ou WAV PCM16 dentro dos limites |
| 429 | Uma análise já está em andamento; não enviar chamadas paralelas |
| 503 com detail de modelo | Credencial passou; conferir modelo, hash e logs do deploy sem publicar dados de amostras |

## Alcance da proteção

A autenticação só protege /rapidapi. A demonstração e os endpoints originais continuam públicos para funcionar como antes. Não há limitação por consumidor ou blindagem da origem no código; quotas do RapidAPI não cobrem chamadas diretas ao Render. O limite de concorrência evita uma fila interna, mas não é controle de abuso global. Não apresentar essa configuração como acesso exclusivo via marketplace.

A exportação não contém credenciais nem altera os contratos de execução. Para regenerar: `python -m scripts.export_rapidapi`; verificar sem gravar: `python -m scripts.export_rapidapi --check`.
