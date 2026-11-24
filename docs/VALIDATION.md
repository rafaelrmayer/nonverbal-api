# Validação inicial — 24/11/2026

## Executado neste ambiente

- `python -m pytest -q`: **44 testes aprovados**. Os testes unitários usam pontos e imagens gerados em código e detector injetado para os contratos da API.
- Modelo MediaPipe real, em CPU, com asset verificado pelo hash fixado: imagem branca gerada → `no_pose`.
- API real com modelo carregado: a imagem pública de exemplo do MediaPipe retornou HTTP **200**, uma pose e **22 pontos corporais**. As duas relações punho/ombro retornaram `undetermined/near_threshold`, conforme a margem geométrica; não foi forçado um gesto.
- O processo local dessa verificação teve pico observado de aproximadamente 237 MiB. Esse número é somente uma observação local, não dimensionamento de hospedagem ou garantia de memória.
- Compilação Python, sintaxe dos comandos do workflow e links relativos da documentação conferidos.

A execução local do MediaPipe exigiu disponibilizar `libGLESv2.so.2` no ambiente de teste; o Dockerfile instala as dependências nativas correspondentes. Nenhum binário nativo ou imagem de pessoa foi incluído no repositório.

## Contêiner: verificação pendente

O build local padrão esbarrou no certificado do proxy deste ambiente. Uma tentativa local com a cadeia de certificados confiável montada temporariamente avançou na instalação, mas não concluiu por falta de espaço no armazenamento Docker (VFS). A verificação TLS não foi desabilitada; o Dockerfile do projeto não contém certificados do ambiente nem exceções de TLS.

Portanto, **não foi confirmado o build completo nem a execução do contêiner nesta sessão**. O workflow tem um job `container-smoke` para construir a imagem e carregar o modelo real numa imagem branca, com limite de 512 MiB/1 CPU, em um runner separado. Esse check precisa passar antes da implantação.

O modelo e a API foram testados nativamente, mas esses testes não substituem a verificação do contêiner ou da hospedagem. Não houve publicação, teste de carga, estudo de acurácia ou avaliação clínica.
