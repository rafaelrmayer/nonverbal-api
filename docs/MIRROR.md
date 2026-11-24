# Espelho de pontinhos

A aba **Espelho de pontinhos** na página inicial acompanha movimentos da câmera no próprio navegador. Ela compartilha a tela com **Analisar uma foto**, mantendo processamento separado da API de imagens. O endereço `/mirror` abre a mesma página com o espelho selecionado; `/#mirror` e `/#photo` também selecionam o modo. A API continua sem endpoint de vídeo.

## Fluxo e privacidade

Ao clicar em **Iniciar espelho**, o navegador busca configuração, SDK e modelo no mesmo domínio do site. O modelo tem o mesmo SHA-256 fixado em `app/model_asset.py`, validado tanto pelo servidor quanto pelo worker antes de executar. O runtime Web é `@mediapipe/tasks-vision@0.10.32`, fixado no lockfile; arquivos originais são copiados no build, sem CDN em tempo de uso. O download inicial inclui aproximadamente 6 MB de modelo e 11 MB de WASM, além do código JavaScript. Assets versionados podem ficar no cache; frames não são gravados ou colocados no cache.

Só depois da preparação é solicitada a permissão da câmera, sempre sem áudio. Não há POST, upload de frames, gravação, armazenamento persistente de imagens ou serviço externo de inferência neste modo. O servidor pode registrar acessos aos arquivos, conforme a configuração da hospedagem.

Um worker clássico executa MediaPipe em modo VIDEO/CPU, até duas poses. Ele recebe um ImageBitmap reduzido a no máximo 640 pixels no lado maior e devolve o mesmo bitmap junto com os pontos. A página desenha os dois juntos, evitando sobrepor pontos antigos a uma imagem nova. Há somente um frame em processamento; o próximo é solicitado pelo menos 125 ms depois da resposta. A velocidade e o atraso dependem do aparelho.

Somente IDs corporais 11–32 são desenhados. Pontos fora do quadro, não finitos ou com `visibility < 0.7` são omitidos, assim como linhas ligadas a eles. O SDK Web não fornece `presence` por ponto: o espelho usa apenas a visibilidade disponível e não fabrica esse campo. A API Python mantém sua regra original com visibility e presence. O espelho não executa a regra punho/ombro nem atribui emoção, intenção, atenção ou identidade. Cores distinguem desenhos no frame, sem identidade persistente.

Trocar de modo, **Parar câmera**, ocultar a aba ou sair da página encerra os tracks, termina o worker e limpa os canvases. Uma permissão concedida depois de parar também tem seus tracks encerrados. O botão para parar funciona durante o download. Falhas não acionam envio alternativo à API. Há tempo máximo de preparação e de processamento de um frame para evitar sessão presa.

## Preparação local e Docker

Além da instalação Python e do download do modelo documentados no README:

```bash
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
