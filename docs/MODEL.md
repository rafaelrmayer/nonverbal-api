# Modelo e evidências

## Asset usado

- Modelo: MediaPipe Pose Landmarker Lite, bundle float16, revisão 1.
- URL: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`.
- Tamanho verificado em 24/11/2026: 5.777.746 bytes.
- SDK testado: MediaPipe 0.10.35, Python 3.12, Linux x86-64, delegate CPU.
- Referência: [documentação oficial e links das model cards](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker).

O arquivo é obtido em etapa explícita e não é incluído no Git. A versão e o hash são fixados para impedir substituição silenciosa por outro asset. O hash verifica identidade/integridade; não certifica qualidade, segurança clínica ou calibração. Código, SDK e modelos têm condições próprias; a fonte/model card deve acompanhar uma futura distribuição pública. O conteúdo da página de documentação não deve ser confundido com a licença específica do asset.

## Hipóteses do protótipo

A inferência usa modo IMAGE, sem rastreamento temporal, até duas poses e sem máscara de segmentação. O detector retorna 33 pontos; a API omite 0–10 (rosto), preservando 11–32. Uma relação geométrica é calculada somente quando o punho e o ombro correspondente estão visíveis e dentro do quadro.

Os limiares de visibilidade/presença 0,7 e margem vertical 0,05 são decisões provisórias da regra, não métricas de acurácia. Não há rótulos de emoção, atenção, intenção, autismo ou linguagem corporal “universal”. Uma mudança de regra ou modelo exige revisão do contrato e testes, não alteração silenciosa de significado.

## Evidências em 24/11/2026

- Testes automatizados de contratos, tratamento de imagens, geometria, abstenção, tamanho, concorrência, tempo de envio, disponibilidade e hash do asset.
- Smoke test com modelo real em CPU: imagem branca gerada → `no_pose`, sem observação inventada.
- Teste local com a imagem pública de demonstração `https://storage.googleapis.com/mediapipe-assets/pose.jpg`: o modelo detectou uma pose com 33 pontos. O arquivo foi usado temporariamente e não é incluído no repositório. Isso é um teste funcional pontual, não um benchmark ou validação em pessoas reais do público-alvo.

Não há estudo de acurácia, comparação entre grupos, avaliação clínica, validação em crianças, auditoria de acessibilidade ou teste de carga. Nenhuma conclusão sobre generalização deve ser extraída desses exemplos.

## Dados e limites

A aplicação não reconhece identidades, não mantém histórico, não persiste imagens e não aprende com os envios. O protótipo não oferece consentimento/cadastro/gestão de dados de participantes. Testes com pessoas e integrações sensíveis exigirão um projeto específico antes de coletar dados, além de controles de acesso e avaliação apropriados ao uso pretendido.
