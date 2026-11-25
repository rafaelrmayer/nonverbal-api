# Nonverbal API

**Autor:** Rafael Ricardo Mayer · **Versão:** 0.1.0 · **Estado:** protótipo com módulos corporal, facial e vocal hospedado no Render; integração RapidAPI preparada, com publicação no painel ainda pendente.

API independente em Python/FastAPI para **descrever sinais corporais observáveis em uma imagem**, sem inferir emoção, intenção, atenção, personalidade ou condição clínica. A API oferece contornos faciais e geometria por foto, mas não interpreta o significado de expressões, voz ou microexpressões e não interpreta automaticamente a comunicação de pessoas autistas.

O repositório foi criado como público por decisão do responsável. Demonstração hospedada: https://nonverbal-api.onrender.com/. Imagens de pessoas e pesos do modelo não são versionados.

## O que funciona nesta versão

- Recebe bytes de uma imagem JPEG ou PNG e executa o **MediaPipe Pose Landmarker Lite** em CPU.
- Retorna os **22 pontos corporais** de IDs 11–32: ombros, cotovelos, punhos, pontos das mãos, quadris, joelhos e pés. Os pontos faciais produzidos internamente pelo detector não são expostos.
- Observa, separadamente para cada braço, se o **punho está acima do respectivo ombro no plano da imagem**. É uma regra geométrica experimental, não reconhecimento de intenção de levantar a mão.
- Quando não há evidência suficiente, retorna `undetermined` e o motivo. Ausência de evidência não vira uma classificação negativa.
- Se nenhuma pose for detectada, retorna `no_pose`. Se o detector encontrar duas poses, retorna `multiple_poses`, sem escolher uma pessoa nem atribuir uma identidade.
- Processa em memória, sem banco, gravação de imagens, reconhecimento de identidade ou aprendizado por consulta no código da API.

O modelo estima 33 pontos por pose; a API filtra o resultado para o canal corporal. [Documentação oficial do MediaPipe](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker).

## Demonstração visual com câmera

A página inicial reúne **Analisar uma foto** (câmera por captura ou upload) e **Espelho de pontinhos**, além de **Voz e áudio**, em três abas. Ao trocar de modo, a câmera é encerrada e a visualização anterior é limpa. No modo por foto, a prévia da câmera é local, sem áudio. Uma imagem só é enviada ao clicar em **Capturar e analisar** ou **Analisar imagem**; os pontos são exibidos sobre a mesma imagem enviada, junto com observações de cada braço e JSON opcional.

Há controles para desligar a câmera, voltar à prévia e limpar os dados locais. Sair/ocultar a página também encerra a câmera. A captura precisa de HTTPS ou localhost. No modo por foto não há gravação, envio contínuo ou armazenamento persistente; a aba vocal possui gravação local explícita e controles próprios.

Consulte o [guia da demonstração](docs/DEMO.md) para limites, testes e verificação em dispositivo real. A página é servida pela própria API; não é necessário um site separado. A captura e o upload já foram experimentados pelo responsável em dispositivo real.

## Espelho de pontinhos no navegador

A aba **Espelho de pontinhos** oferece uma brincadeira visual com pontos e linhas acompanhando a câmera. O processamento acontece no dispositivo, em um worker WebAssembly, sem envio de frames ou áudio. Inclui opções de só pontinhos e imagem espelhada, até duas poses e botão para parar. O detalhamento opcional das mãos acompanha 21 pontos por mão, fecha o contorno da palma e pode desenhar um triângulo entre o punho e as pontas do indicador e do médio quando a geometria corresponde a dois dedos abertos. Não interpreta o significado do gesto. O primeiro início baixa SDK e modelo do próprio site; velocidade e compatibilidade dependem do aparelho. Não interpreta comportamento.

Os modos compartilham a página, mas cada um mantém seu fluxo de processamento. Isso não adiciona vídeo ao contrato da API. O endereço `/mirror` continua abrindo a página com o espelho selecionado. Veja [preparação, privacidade e testes](docs/MIRROR.md). A câmera real do novo modo deve ser conferida após implantar esta alteração.

## Módulo facial do espelho

O espelho agora também oferece **Rosto e contornos**: linhas de olhos, sobrancelhas, lábios e mandíbula e medidas opcionais de abertura relativa dos olhos e da boca. As medidas são razões geométricas, não porcentagens, emoções, atenção ou diagnóstico. São exibidas apenas quando há um rosto detectado e pontos suficientes; dois rostos podem ter contornos desenhados sem atribuição de identidade.

Corpo, mãos e rosto podem ser selecionados antes de iniciar. Usar só rosto reduz o processamento e evita baixar os outros modelos para aquela sessão. O modelo facial adicional tem aproximadamente 4 MB, é servido pelo próprio site e validado por SHA-256. Não há envio de frames, áudio, reconhecimento de identidade ou armazenamento de rostos. Isso pertence ao espelho no navegador: o endpoint `/v1/face/analyze` também oferece contornos e medidas por foto com envio explícito. A verificação com câmera física é feita após a implantação; testes com pontos sintéticos não medem precisão real.

## Endpoints

| Método | Caminho | Resultado |
| --- | --- | --- |
| GET | `/` | Demonstração unificada: análise por foto e espelho local. |
| GET | `/mirror` | Mesma demonstração, iniciando na aba do espelho local. |
| GET | `/health` | Estado do processo e `body_model_ready`. Health 200 não garante modelo disponível. |
| GET | `/v1/models` | Modelo, hash, disponibilidade, recursos e canais não implementados. |
| POST | `/v1/body/analyze` | Imagem → pontos corporais e observações geométricas. |
| POST | `/v1/face/analyze` | JPEG/PNG → contornos faciais e razões de abertura; sem escolher entre múltiplos rostos. |
| POST | `/v1/vocal/analyze` | WAV PCM16 → energia digital, periodicidade estimada e intervalos de baixa energia. |
| GET | `/docs` | Interface Swagger para explorar o contrato. |
| GET | `/openapi.json` | Definição OpenAPI. |

Envie o **arquivo binário diretamente**, com `Content-Type: image/jpeg` ou `image/png`. Esses endpoints de imagem não aceitam URL remota, base64, multipart, áudio ou vídeo. Limites: **2 MiB**, **4 milhões de pixels**, uma análise em andamento por processo, até **10 segundos para receber o corpo**. Imagens animadas são recusadas. O modelo recebe uma versão redimensionada para no máximo 1280 pixels no lado maior, após aplicar a orientação EXIF.

```bash
curl -X POST http://127.0.0.1:8000/v1/body/analyze \
  -H 'Content-Type: image/jpeg' \
  --data-binary @imagem-autorizada.jpg
```

Use uma imagem de teste que você tenha direito e autorização para processar. Não use prontuários, gravações de terceiros ou imagens de crianças como material inicial de demonstração. O protótipo ainda não tem autenticação ou limite por consumidor e não está preparado para exposição pública irrestrita.

## Como interpretar a resposta

O resultado inclui `experimental=true`, versão, hash do modelo, dimensões da imagem orientada e processada, sistema de coordenadas, pontos e observações dos braços.

| Campo/status | Significado |
| --- | --- |
| `observed` | As duas relações punho/ombro puderam ser determinadas pela regra. |
| `partial` | Somente uma relação pôde ser determinada. |
| `undetermined` | Há uma pose, mas nenhuma das duas relações pôde ser determinada. |
| `no_pose` | Nenhuma pose detectada; não comprova que a imagem não contenha uma pessoa. |
| `multiple_poses` | Pelo menos duas poses detectadas; não há escolha automática de indivíduo. |
| `detected_poses_capped` | Quantidade detectada limitada a dois, não contagem completa de pessoas na imagem. |

Os pontos têm `x`, `y` normalizados pela imagem, com origem no canto superior esquerdo; `y` aumenta para baixo. Valores previstos podem ficar fora do quadro: não são recortados silenciosamente, e `in_frame=false` impede a classificação daquele braço. `z` é profundidade relativa estimada pelo modelo, **não distância física medida em metros**. `left`/`right` seguem a atribuição anatômica do modelo, não a esquerda/direita de quem vê a imagem. Espelhamento, perspectiva e erros do detector podem afetá-la.

A regra requer ombro e punho dentro do quadro, com `visibility` **e** `presence` de pelo menos **0,7**. Se `shoulder.y - wrist.y > 0,05`, observa `wrist_above_shoulder`; se menor que `-0,05`, observa `wrist_not_above_shoulder`. A faixa intermediária é `undetermined/near_threshold`. A margem é uma fração da altura da imagem, depende do enquadramento e não foi calibrada em estudo. Os escores do detector não são probabilidades calibradas da interpretação, e não há uma “confiança emocional” ou escore clínico agregado.

Câmera inclinada, pessoa deitada, enquadramento, oclusão, vestuário, iluminação, resolução e domínio da imagem podem produzir erros. Uma única pose detectada não garante que não existam outras pessoas. A API não verifica a situação real nem substitui a escolha/expressão da pessoa.

## Executar localmente

Python 3.12 em Linux x86-64 é o ambiente inicial. Dependências nativas necessárias ao MediaPipe: `libgl1`, `libegl1`, `libgles2`, `libglib2.0-0`. O Dockerfile já as instala.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m scripts.download_model
python -m scripts.download_hand_model
python -m scripts.download_face_model
# Para habilitar o espelho local (Node 24):
npm ci
npm run prepare:mirror
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

O download é **explícito**, de uma URL oficial fixa, com SHA-256 validado antes da instalação. O processo de inferência não baixa arquivos. O modelo não fica versionado no GitHub e não é treinado por este projeto. `POSE_MODEL_PATH` pode apontar para o asset aprovado, mas o hash deve corresponder à versão fixada em [app/model_asset.py](app/model_asset.py). Um asset ausente ou incompatível mantém health disponível com `body_model_ready=false` e análise retornando 503.

```bash
python -m pytest -q
python -m scripts.smoke_model
```

Os testes unitários usam pontos e imagens gerados em código e um detector injetado para testar contratos; **não medem acurácia do MediaPipe**. O smoke test separado carrega o modelo real em CPU e verifica `no_pose` numa imagem branca gerada localmente. O workflow tem jobs distintos para essas duas verificações.

## Contêiner e implantação

```bash
docker build -t nonverbal-api:0.1 .
docker run --rm -p 127.0.0.1:8000:7860 nonverbal-api:0.1
```

A imagem usa um usuário sem privilégios, uma instância do modelo e um worker. O modelo é baixado e validado no build. Banco e GPU não são necessários. A integração opcional com o RapidAPI exige `RAPIDAPI_PROXY_SECRET` apenas no ambiente do servidor. A URL HTTPS, os limites e o custo de hospedagem devem ser definidos antes de implantar; este repositório não cria serviço pago, URL pública ou listagem RapidAPI.

O código da API não guarda uploads, não envia as imagens a outro serviço de inferência nem escreve seu conteúdo em logs. O provedor de hospedagem e clientes podem manter metadados de acesso, segundo suas próprias configurações; isso não é uma promessa de anonimato ou conformidade legal. Respostas de análise e páginas usam `Cache-Control: no-store`; apenas assets versionados do espelho usam cache imutável.

## Arquitetura e recursos

```text
JPEG/PNG limitado → decodificação e orientação em memória → MediaPipe em CPU
                 → 22 pontos corporais → regra geométrica com abstenção → JSON
```

A regra e a validação ficam separadas do detector. Não há chamada a LLM, RAG, treinamento, perfil pessoal, rastreamento entre imagens ou integração com o banco da Jornada de Bia.

O limite de uma análise por processo evita fila de inferências dentro do aplicativo; requisições adicionais recebem 429, com `Retry-After`. Isso não substitui autenticação, rate limiting global ou proteção da infraestrutura. O recurso limita a concorrência, não mede capacidade de produção.

Veja o [registro da validação inicial e do contêiner](docs/VALIDATION.md), [docs/MODEL.md](docs/MODEL.md) para procedência, limites e evidências de teste e [docs/ROADMAP.md](docs/ROADMAP.md) para o recorte inicial e próximos passos.

## Vídeo e trajetórias locais

No espelho, selecione **Arquivo de vídeo local** ou use a câmera. Vídeos MP4/WebM/MOV dependem do codec suportado pelo navegador e têm limites de 100 MiB, 60 segundos e 4 milhões de pixels por frame. Não há upload, análise de áudio ou endpoint de vídeo. O processamento usa frames amostrados durante a reprodução, com pausa/continuação.

Os rastros de punhos e tornozelos usam até dois segundos de amostras em memória e só uma pose detectada. Distâncias são relativas à diagonal da imagem; não são metros, velocidade física ou classificação de comportamento. Veja [VIDEO.md](docs/VIDEO.md) e [FACE_PHOTO.md](docs/FACE_PHOTO.md) para contratos, limites e testes.

## Voz e áudio

A terceira aba permite selecionar WAV PCM16 ou gravar uma amostra de microfone por até 30 segundos. Gravação e prévia ficam no navegador; **Analisar áudio** envia uma cópia explicitamente à API. Parar, trocar de modo, ocultar ou sair da página encerra o microfone e limpa dados locais. Não há envio automático ou gravação persistente pelo código da aplicação.

O endpoint `/v1/vocal/analyze` aceita até 8 MiB, 30 segundos, mono/estéreo e 8–48 kHz. Retorna RMS/pico em dBFS, frequência fundamental estimada por periodicidade (ou null), curva de energia e intervalos abaixo do limiar de energia. Não transcreve nem classifica emoção, identidade, intenção, fala ou hesitação. É processamento de sinal determinístico, sem modelo treinado adicional. Veja [VOCAL.md](docs/VOCAL.md) para método, limites, privacidade e testes.

## Preparação para o RapidAPI

O namespace `/rapidapi` encaminha somente as cinco operações HTTP documentadas, mediante `X-RapidAPI-Proxy-Secret`. Sem configuração, responde 503; sem segredo correto, 403. Os endpoints originais e a demonstração permanecem públicos: essa proteção e as cotas do RapidAPI não abrangem os acessos diretos à origem.

O arquivo [docs/rapidapi/openapi.json](docs/rapidapi/openapi.json) exporta as cinco operações em OpenAPI 3.0.3 para importação, com Base URL `https://nonverbal-api.onrender.com/rapidapi`. Não contém segredo nem chave de consumidor. Para regenerar: `python -m scripts.export_rapidapi`; para conferir: `python -m scripts.export_rapidapi --check`.

A publicação, os planos e o segredo ainda precisam ser configurados pelo responsável nos painéis. O [guia de publicação](docs/RAPIDAPI.md) inclui os textos da listagem, o plano gratuito sugerido e um teste manual via Actions com PNG/WAV sintéticos. A existência desse arquivo não significa que a listagem já está pública.

## Conferência prática da demonstração

Em 25/11/2026, o responsável confirmou funcionamento no serviço hospedado de corpo/mãos, contornos faciais, análise facial por foto, vídeo local e gravação/análise vocal com câmera e microfone reais. Essa conferência funcional não é benchmark, validação de precisão, teste de carga ou garantia de compatibilidade com todos os aparelhos.
