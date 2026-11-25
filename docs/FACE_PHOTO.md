# Facial por foto e API HTTP

Em **Analisar uma foto**, escolha **Rosto e abertura dos olhos/boca**. Câmera e arquivo geram prévia local; só um clique em Capturar e analisar ou Analisar imagem envia a imagem à API. A resposta aparece sobre a mesma imagem enviada, com contornos, razões de abertura e JSON. Trocar de análise, limpar ou sair do modo invalida respostas tardias e limpa resultados.

`POST /v1/face/analyze` recebe bytes JPEG/PNG, não multipart/base64/URL/vídeo. Limites compartilhados com o corporal: 2 MiB, 4 milhões de pixels, imagem estática, até 10 s para receber bytes, redimensionamento até 1280 pixels e orientação EXIF. Imagens inválidas são recusadas antes de carregar o modelo. Os dois endpoints compartilham uma vaga de inferência: requisição concorrente recebe 429 com Retry-After.

```bash
curl -X POST https://nonverbal-api.onrender.com/v1/face/analyze \
  -H 'Content-Type: image/jpeg' --data-binary @foto-autorizada.jpg
```

O modelo CPU/IMAGE detecta até dois rostos. Sem rosto, retorna `no_face`; com dois, `multiple_faces`, sem escolher uma pessoa, pontos ou medidas individuais. Para uma detecção, retorna somente pontos 2D finitos dentro do quadro dos contornos oficiais usados pelo espelho. Não retorna z, visibilidade/presença fabricadas, blendshapes, identidade ou matrizes. Modelo e SHA-256 acompanham a resposta.

`measures` contém mouth, leftEye e rightEye, com `value` sem unidade ou null e `reason`: geometry_observed, missing_landmarks, region_too_small, no_face, multiple_faces. Os cálculos e limites são os mesmos de MIRROR.md, usando as dimensões processadas da imagem. Status é observed para três medidas, partial para uma/duas e undetermined para nenhuma. Pontos insuficientes não viram medidas zero. Não classifica emoções, diagnóstico ou atenção.

Health informa `face_model_available` (asset com hash verificado) e `face_model_ready` (instância carregada). A instância é criada na primeira análise válida, reutilizada sob o limite compartilhado e fechada no encerramento; falha de inicialização responde 503 sem expor caminhos. A disponibilidade do asset não garante sucesso da inferência. O primeiro pedido pode ser mais lento. Respostas usam no-store e imagens ficam apenas em memória.

Os testes verificam contrato, geometria, abstenção, erros, carregamento tardio/reutilização, encerramento e envio explícito no navegador. O smoke test do contêiner carrega os dois modelos reais simultaneamente com 512 MiB e uma imagem branca. Isso não mede precisão facial: conferir após implantação com foto autorizada, sem rosto e com múltiplos rostos.
