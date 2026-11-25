# Espelho de pontinhos

A aba **Espelho de pontinhos** na página inicial acompanha movimentos da câmera no próprio navegador. Ela compartilha a tela com **Analisar uma foto**, mantendo processamento separado da API de imagens. O endereço `/mirror` abre a mesma página com o espelho selecionado; `/#mirror` e `/#photo` também selecionam o modo. A API continua sem endpoint de vídeo; o arquivo é reproduzido e processado localmente, conforme [VIDEO.md](VIDEO.md).

## Fluxo e privacidade

Ao clicar em **Iniciar espelho**, o navegador busca configuração, SDK e os modelos selecionados no mesmo domínio do site. O modelo tem o mesmo SHA-256 fixado em `app/model_asset.py`, validado tanto pelo servidor quanto pelo worker antes de executar. O runtime Web é `@mediapipe/tasks-vision@0.10.32`, fixado no lockfile; arquivos originais são copiados no build, sem CDN em tempo de uso. O download inicial inclui aproximadamente 6 MB do modelo corporal e 11 MB de WASM, além do código JavaScript. Com **Detalhar mãos e dedos** marcado (padrão), inclui também aproximadamente 8 MB do modelo de mãos. O módulo **Rosto e contornos** acrescenta aproximadamente 4 MB. Somente modelos dos módulos marcados são baixados e executados; é possível desmarcar corpo, mãos ou rosto antes de iniciar. Pelo menos um módulo deve estar marcado. Assets versionados podem ficar no cache; frames não são gravados ou colocados no cache.

Só depois da preparação é solicitada a permissão da câmera, sempre sem áudio. Não há POST, upload de frames, gravação, armazenamento persistente de imagens ou serviço externo de inferência neste modo. O servidor pode registrar acessos aos arquivos, conforme a configuração da hospedagem.

Um worker clássico executa os módulos selecionados em modo VIDEO/CPU: até duas poses, duas mãos e dois rostos. Ele recebe um ImageBitmap reduzido a no máximo 640 pixels no lado maior e devolve o mesmo bitmap junto com os pontos. A página desenha os dois juntos, evitando sobrepor pontos antigos a uma imagem nova. Há somente um frame em processamento; o próximo é solicitado pelo menos 125 ms depois da resposta. A velocidade e o atraso dependem do aparelho.

Para o corpo, somente IDs 11–32 são desenhados. Pontos fora do quadro, não finitos ou com `visibility < 0.7` são omitidos, assim como linhas ligadas a eles. O SDK Web não fornece `presence` por ponto: o espelho usa apenas a visibilidade disponível e não fabrica esse campo. A API Python mantém sua regra original com visibility e presence. O espelho não executa a regra punho/ombro nem atribui emoção, intenção, atenção ou identidade. Cores distinguem desenhos no frame, sem identidade persistente.

Trocar de modo, **Parar câmera**, ocultar a aba ou sair da página encerra os tracks, termina o worker e limpa os canvases. Uma permissão concedida depois de parar também tem seus tracks encerrados. O botão para parar funciona durante o download. Falhas não acionam envio alternativo à API. Há tempo máximo de preparação e de processamento de um frame para evitar sessão presa.

## Preparação local e Docker

Além da instalação Python e do download do modelo documentados no README:

```bash
python -m scripts.download_hand_model
python -m scripts.download_face_model
npm ci
npm run prepare:mirror
```

Node 24 é usado apenas no build/setup. A imagem Docker faz essa preparação em um estágio separado, sem Node na imagem final. Os arquivos gerados em `app/browser-runtime` não são versionados. O servidor serve somente uma lista explícita de arquivos do runtime. O SDK e seu texto de licença Apache-2.0 são distribuídos juntos; essa licença do pacote não é apresentada como licença do modelo, cuja procedência está em [MODEL.md](MODEL.md).

Requer HTTPS (ou localhost), câmera, Worker, ImageBitmap, OffscreenCanvas e suporte a WebAssembly. A CSP permite WASM e conexões apenas ao próprio domínio. Sem permissão ou compatibilidade, há uma mensagem e um link para a demonstração por foto; esse outro modo tem envio explícito de uma imagem à API.

## Verificação

- Testes Python: separação da API, CSP, lista de arquivos permitidos, caches e rejeição de modelo corrompido.
- Testes Node: filtragem corporal, pontos incertos e redimensionamento.
- GitHub Actions: Chromium com câmera sintética, execução real do worker/WASM sobre imagem branca, loop local, ausência de uploads/conexões externas, encerramento e permissão tardia.

Esses testes verificam funcionamento e fluxo, não acurácia ou adequação clínica. Depois da implantação, testar manualmente em computador e celular: permissão, pontos acompanhando uma pessoa, opção só pontinhos, espelhamento, botão parar e saída da aba. Câmera real e desempenho móvel ainda dependem dessa verificação. Não são necessárias imagens de pessoas nos testes automatizados.

## Navegação unificada

As abas de experiência aceitam setas, Home e End. As abas Câmera/Arquivo pertencem somente ao modo por foto. Trocar de experiência encerra a câmera, cancela a preparação do worker ou o envio em andamento no cliente e limpa a visualização; nenhuma câmera é ativada automaticamente no modo seguinte. Um envio já recebido pelo servidor pode concluir seu processamento, mas sua resposta não reaparece na interface. O modelo do espelho só é baixado após clicar em Iniciar espelho.

## Mãos e contornos fechados

O Hand Landmarker é um segundo modelo executado no mesmo worker, sobre o mesmo frame em modo VIDEO/CPU, até duas mãos. O backend apenas serve o asset fixado: não recebe imagens das mãos. Cada mão fornece 21 pontos (punho, articulações e pontas dos cinco dedos). Pontos não finitos ou fora da imagem são omitidos. O SDK de mãos não fornece visibilidade/presença por ponto; esses escores não são inventados. A confiança de detecção/presença/rastreamento do modelo é configurada em 0,6.

A linha da palma fecha o ciclo 0–5–9–13–17–0. Com **Fechar triângulo com dois dedos**, uma regra geométrica liga punho (0), ponta do indicador (8) e ponta do médio (12), fechando o caminho. Exige indicador e médio estendidos em relação às articulações intermediárias, anelar e mínimo dobrados, separação e área mínimas. Usa distâncias em pixels, preservando o cálculo sob rotação/espelhamento e proporção da imagem. Não há rótulo de tesoura, tradução de Libras ou interpretação do significado do gesto. Limiares são experimentais; ângulo, tamanho e oclusão podem causar erros ou oscilação.

Se pontos necessários somem ou a condição deixa de valer, o triângulo some no próximo frame processado. Desmarcar sua opção remove o desenho imediatamente. O detalhamento das mãos pode ser desligado antes de iniciar para reduzir consumo de memória e tempo de inferência. Falha no asset de mãos apresenta erro e orienta tentar sem esse detalhamento, sem envio alternativo ao servidor. A análise por foto também possui um endpoint facial separado, conforme [FACE_PHOTO.md](FACE_PHOTO.md).

Testes adicionais cobrem geometria positiva/negativa e rotação, filtragem, encerramento do contorno, renderização/remoção do triângulo com pontos sintéticos e carga real dos dois modelos no worker sobre uma imagem branca. Esses testes não validam detecção de dedos de uma pessoa: após implantar, conferir manualmente com mão inteira próxima à câmera, boa luz, dois dedos abertos, mão aberta e punho fechado.

## Rosto e medidas de abertura

**Rosto e contornos** desenha olhos, sobrancelhas, lábios e oval/mandíbula em verde. As conexões são as oficiais do SDK fixado. Só pontos finitos dentro do quadro são desenhados, sem completar pontos ausentes. Não há reconhecimento de identidade, histórico de rostos, blendshapes, emoção, atenção, gaze ou estimativa clínica. Falha no modelo facial orienta tentar novamente com esse módulo desmarcado, sem envio alternativo ao servidor.

**Mostrar medidas de abertura** pode ser ligado/desligado durante a sessão. Os valores usam distâncias em pixels no frame processado:

- Boca: distância 13–14 dividida pela largura 61–291.
- Olho esquerdo do modelo: média de 386–374 e 385–380, dividida por 362–263.
- Olho direito do modelo: média de 159–145 e 158–153, dividida por 33–133.

Os rótulos esquerdo/direito seguem o modelo; espelhar a imagem não troca a atribuição dos pontos. A notação “×” indica uma razão sem unidade (ex.: altura equivalente a 0,15 da largura), não confiança ou porcentagem. Não há classificação de olho aberto/fechado ou contador de piscadas. Sem os pontos necessários, largura suficiente (8 pixels para boca, 4 para olhos), ou com dois rostos detectados, a medida fica “—”. Distância muito pequena, ângulo fora do plano, óculos, oclusão e iluminação podem distorcer o resultado. Ausência de ponto não comprova ausência da região.

Ao perder a detecção, o próximo frame limpa contornos e medidas anteriores. Parar, ocultar a página ou trocar de experiência também limpa tudo. Os controles dos módulos ficam bloqueados enquanto a sessão está ativa; parar os libera. Não há persistência de coordenadas ou valores. Os valores mudam sem avisos de leitor de tela a cada frame para evitar anúncios contínuos.

A CI testa os três modelos reais juntos e o modelo facial isolado sobre imagem branca, sem buscar pesos dos módulos desativados. Pontos sintéticos verificam contornos, razões, espelhamento/rotação, ausência de evidência, desenho, múltiplos rostos, limpeza e controles. Após o merge e a implantação, testar manualmente rosto inteiro no quadro, piscar, abrir/fechar a boca, modo só pontinhos, desligamento e opções com corpo/mãos. A precisão e o desempenho com câmera física ainda dependem dessa etapa.

O modo de arquivo de vídeo usa os mesmos módulos locais selecionados. Não pede câmera e não envia o arquivo. O rastreamento de movimento e a limpeza de URLs temporárias estão descritos em [VIDEO.md](VIDEO.md).
