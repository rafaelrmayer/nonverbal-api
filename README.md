# Nonverbal API

**Autor:** Rafael Ricardo Mayer · **Versão:** 0.1.0 · **Estado:** protótipo corporal hospedado no Render; ainda sem publicação no marketplace.

API independente em Python/FastAPI para **descrever sinais corporais observáveis em uma imagem**, sem inferir emoção, intenção, atenção, personalidade ou condição clínica. A API desta primeira versão não analisa rosto, voz, microexpressões ou vídeo e não interpreta automaticamente a comunicação de pessoas autistas.

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

A página inicial do serviço oferece **câmera por captura** e **upload de imagem**. A prévia da câmera é local, sem áudio. Uma imagem só é enviada ao clicar em **Capturar e analisar** ou **Analisar imagem**; os pontos são exibidos sobre a mesma imagem enviada, junto com observações de cada braço e JSON opcional.

Há controles para desligar a câmera, voltar à prévia e limpar os dados locais. Sair/ocultar a página também encerra a câmera. A captura precisa de HTTPS ou localhost. Não há gravação, envio contínuo, armazenamento no navegador ou nova interpretação de emoção/intenções.

Consulte o [guia da demonstração](docs/DEMO.md) para limites, testes e verificação em dispositivo real. A página é servida pela própria API; não é necessário um site separado. A captura e o upload já foram experimentados pelo responsável em dispositivo real.

## Espelho de pontinhos no navegador

A página `/mirror` oferece uma brincadeira visual com pontos e linhas acompanhando a câmera. O processamento acontece no dispositivo, em um worker WebAssembly, sem envio de frames ou áudio. Inclui opções de só pontinhos e imagem espelhada, até duas poses e botão para parar. O primeiro início baixa SDK e modelo do próprio site; velocidade e compatibilidade dependem do aparelho. Não interpreta comportamento.

Este modo é separado da análise por foto e não adiciona vídeo ao contrato da API. Veja [preparação, privacidade e testes](docs/MIRROR.md). A câmera real do novo modo deve ser conferida após implantar esta alteração.

## Endpoints

| Método | Caminho | Resultado |
| --- | --- | --- |
| GET | `/` | Demonstração com câmera por captura e upload de imagem. |
| GET | `/mirror` | Espelho local com câmera, sem envio de frames. |
| GET | `/health` | Estado do processo e `body_model_ready`. Health 200 não garante modelo disponível. |
| GET | `/v1/models` | Modelo, hash, disponibilidade, recursos e canais não implementados. |
| POST | `/v1/body/analyze` | Imagem → pontos corporais e observações geométricas. |
| GET | `/docs` | Interface Swagger para explorar o contrato. |
| GET | `/openapi.json` | Definição OpenAPI. |

Envie o **arquivo binário diretamente**, com `Content-Type: image/jpeg` ou `image/png`. Não há URL remota, base64, multipart, áudio ou vídeo. Limites: **2 MiB**, **4 milhões de pixels**, uma análise em andamento por processo, até **10 segundos para receber o corpo**. Imagens animadas são recusadas. O modelo recebe uma versão redimensionada para no máximo 1280 pixels no lado maior, após aplicar a orientação EXIF.

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

A imagem usa um usuário sem privilégios, uma instância do modelo e um worker. O modelo é baixado e validado no build. Nenhum segredo, banco ou GPU é necessário. A URL HTTPS, os limites e o custo de hospedagem devem ser definidos antes de implantar; este repositório não cria serviço pago, URL pública ou listagem RapidAPI.

O código da API não guarda uploads, não envia as imagens a outro serviço de inferência nem escreve seu conteúdo em logs. O provedor de hospedagem e clientes podem manter metadados de acesso, segundo suas próprias configurações; isso não é uma promessa de anonimato ou conformidade legal. Respostas de análise e páginas usam `Cache-Control: no-store`; apenas assets versionados do espelho usam cache imutável.

## Arquitetura e recursos

```text
JPEG/PNG limitado → decodificação e orientação em memória → MediaPipe em CPU
                 → 22 pontos corporais → regra geométrica com abstenção → JSON
```

A regra e a validação ficam separadas do detector. Não há chamada a LLM, RAG, treinamento, perfil pessoal, rastreamento entre imagens ou integração com o banco da Jornada de Bia.

O limite de uma análise por processo evita fila de inferências dentro do aplicativo; requisições adicionais recebem 429, com `Retry-After`. Isso não substitui autenticação, rate limiting global ou proteção da infraestrutura. O recurso limita a concorrência, não mede capacidade de produção.

Veja o [registro da validação inicial e do contêiner](docs/VALIDATION.md), [docs/MODEL.md](docs/MODEL.md) para procedência, limites e evidências de teste e [docs/ROADMAP.md](docs/ROADMAP.md) para o recorte inicial e próximos passos.
