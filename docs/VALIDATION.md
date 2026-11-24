# Validação inicial — 24/11/2026

## Executado neste ambiente

- `python -m pytest -q`: **44 testes aprovados**. Os testes unitários usam pontos e imagens gerados em código e detector injetado para os contratos da API.
- Modelo MediaPipe real, em CPU, com asset verificado pelo hash fixado: imagem branca gerada → `no_pose`.
- API real com modelo carregado: a imagem pública de exemplo do MediaPipe retornou HTTP **200**, uma pose e **22 pontos corporais**. As duas relações punho/ombro retornaram `undetermined/near_threshold`, conforme a margem geométrica; não foi forçado um gesto.
- O processo local dessa verificação teve pico observado de aproximadamente 237 MiB. Esse número é somente uma observação local, não dimensionamento de hospedagem ou garantia de memória.
- Compilação Python, sintaxe dos comandos do workflow e links relativos da documentação conferidos.

A execução local do MediaPipe exigiu disponibilizar `libGLESv2.so.2` no ambiente de teste; o Dockerfile instala as dependências nativas correspondentes. Nenhum binário nativo ou imagem de pessoa foi incluído no repositório.

## Contêiner validado no GitHub Actions

A [execução 45453221231](https://github.com/rafaelrmayer/nonverbal-api/actions/runs/45453221231) concluiu os dois checks com sucesso: `tests` e `container-smoke`. O segundo construiu o Dockerfile do projeto e executou `python -m scripts.smoke_model` dentro do contêiner, com limite de **512 MiB de memória e 1 CPU**. O modelo real em CPU retornou `no_pose` para a imagem branca gerada.

Essa verificação confirma build, dependências nativas, download/hash do asset e carregamento/execução do modelo nesse runner. Não é teste de carga, dimensionamento de produção ou garantia de que toda entrada suportada ficará dentro do mesmo limite. A implantação no provedor escolhido e sua configuração de acesso ainda precisam ser realizadas.

Não houve hospedagem pública, teste de carga, estudo de acurácia ou avaliação clínica.
