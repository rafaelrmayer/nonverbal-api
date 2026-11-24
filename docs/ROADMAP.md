# Recorte da Nonverbal API

## V0.1 — canal corporal

Primeira entrega: uma imagem JPEG/PNG, detector de pose real, 22 pontos corporais e observação punho/ombro no plano da imagem. Abstenção explícita para pontos pouco visíveis, fora do quadro, proximidade do limiar ou mais de uma pose detectada. Inicialmente sem hospedagem, autenticação, banco, marketplace ou integração com a Jornada de Bia.

## Antes de publicar

1. Revisar a implementação e o contrato e conferir os checks no repositório.
2. Validar build e execução na hospedagem escolhida, medindo memória/CPU com limites reais e acesso controlado. Não inferir capacidade a partir de um teste local.
3. Registrar a licença do código e as atribuições/condições do SDK e asset para distribuição. O responsável criou o repositório como público; o asset continua fora do Git e a publicação do serviço permanece uma etapa separada.
4. Definir autenticação, quotas e limites da infraestrutura antes de aceitar envios públicos. Revisar política de dados e logs do provedor.
5. Avaliar exemplos autorizados e critérios de erro/abstenção para o uso desejado, sem anunciar interpretação emocional ou aplicação clínica.

## Etapas posteriores, sem implementação nesta versão

- Sequência temporal e gestos explicitamente definidos, com avaliação própria.
- Canal vocal com medidas acústicas observáveis; tom ou hesitação não equivalem a emoção ou intenção.
- Canal facial com pontos e movimentos observáveis; AU não equivale automaticamente a emoção, e olhar não comprova atenção.
- Eventual combinação de canais somente após definir problema, dados autorizados e forma de avaliação. Não há “pontuação de intenção” ou inferência de diagnóstico planejada.

A Sensory Load API (ambientes), a Neural API (inferência de demonstração) e a Nonverbal API têm contratos e finalidades distintos. Não reutilizar dados pessoais ou integrar projetos automaticamente por compartilharem o tema de acessibilidade.
