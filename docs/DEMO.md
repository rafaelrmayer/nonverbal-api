# Demonstração com câmera e arquivo

A página inicial / é servida pela própria FastAPI, com arquivos estáticos em /demo-assets. No modo por foto, ela chama /health e /v1/body/analyze da mesma origem; os assets do espelho também são servidos nessa origem. Não existe serviço externo, chave de API no frontend ou armazenamento persistente no navegador.

## Câmera

1. Abrir o serviço em HTTPS ou, em desenvolvimento, localhost.
2. Clicar em **Ativar câmera** e conceder a permissão do navegador. A solicitação usa audio: false, com preferência por câmera frontal ou traseira e resolução de 1280 × 720. O navegador pode escolher outra câmera/resolução disponível.
3. Enquadrar uma pessoa com ombros e punhos visíveis. A prévia é local e não recebe análise ou envio automático.
4. Clicar em **Capturar e analisar**. Um canvas independente guarda o frame; a cópia preparada é enviada uma única vez como JPEG para a API.
5. A resposta é desenhada sobre **o mesmo frame capturado**, sem espelhamento adicional, junto com observações dos braços. Não são desenhados pontos sobre vídeo em movimento como se a resposta fosse atual.
6. Usar **Voltar à prévia** antes de uma nova captura, ou **Desligar** para encerrar as tracks. A câmera pode continuar ativa enquanto o resultado é mostrado; a interface informa esse estado.

Desligar a câmera, trocar para arquivo, ocultar/sair da página ou limpar a demonstração encerra as tracks, inclusive quando uma permissão antiga só termina de resolver depois da troca. Ocultar/sair também limpa os dados locais da análise e cancela a espera por resposta. Não há gravação, áudio, detecção de emoção ou análise contínua de vídeo.

## Arquivo

A seleção de JPEG/PNG gera somente uma prévia local. O envio acontece ao clicar em **Analisar imagem**. A interface limita o arquivo local a 8 MiB, verifica a assinatura, recusa PNG animado e prepara uma cópia JPEG de até 1280 pixels no lado maior. A orientação é aplicada pelo navegador; transparência é composta sobre branco. O corpo enviado deve continuar dentro do limite de 2 MiB da API. O backend mantém sua própria validação, independentemente do frontend.

A preparação não altera o arquivo original. Nome de arquivo, EXIF ou campos pessoais não são acrescentados ao corpo: a API recebe somente os bytes da cópia preparada, com caminho fixo e sem parâmetros na URL.

## Resposta e limites

As relações são exibidas em linguagem simples; undetermined permanece indeterminado, com motivo. Resultados de uma imagem anterior não podem substituir uma nova seleção após limpar/trocar: requisições são abortadas e vinculadas à versão da imagem corrente. Não há reenvio automático de POST em erros ou timeout.

Somente pontos dentro do quadro, com visibilidade e presença de pelo menos 0,7, são desenhados. Não se trata de confiança calibrada do significado do gesto. O JSON permanece em uma área opcional para inspeção técnica. A interface não muda a regra, o detector ou os contratos da API.

**Limpar imagem e resultado** remove dados da interface e cancela a espera local. Não desfaz uma transmissão que já chegou ao servidor; a implementação atual do backend processa em memória, sem persistir uploads. As condições da hospedagem, incluindo metadados de acesso, continuam independentes.

## Verificação

- Testes Python conferem página/arquivos estáticos, políticas de câmera/rede e preservação do OpenAPI.
- Testes Node conferem redimensionamento, assinatura de arquivo, associação da resposta ao frame, filtragem de pontos e mensagens de abstenção.
- O job demo do GitHub Actions usa Chromium com **câmera falsa** e respostas sintéticas interceptadas para testar os fluxos da interface. Não acessa uma webcam de pessoa nem mede a qualidade do MediaPipe.
- A integração do backend com o modelo real permanece verificada separadamente no job container-smoke.
- O ambiente de desenvolvimento desta sessão não oferece a ferramenta de prévia visual gerenciada; não foi feito teste manual de navegador local ou câmera física nele.

Antes de apresentar, testar a câmera real no endereço HTTPS do provedor escolhido: permissão concedida/recusada, desligamento, nova captura, upload e layout no dispositivo desejado. Permissions-Policy permite câmera somente na própria origem e bloqueia microfone. A página não aceita incorporação em iframe de outra origem. A liberação do navegador e o indicador de câmera dependem do dispositivo.

## Publicação

O mesmo Dockerfile copia os assets junto do pacote app. Não é necessário outro servidor de frontend ou CORS para a demonstração. Ela ficará disponível na raiz após o deploy do serviço. Nenhuma hospedagem, assinatura ou publicação externa é criada por este PR.

O endpoint continua sendo um protótipo sem autenticação ou quota por consumidor. A demonstração não substitui esses controles; decidir acesso e limites da infraestrutura antes de aceitar uploads públicos irrestritos.

## Espelho na mesma página

A página inicial reúne a captura por foto e o espelho em abas. O endereço `/mirror` seleciona diretamente o espelho, que executa no navegador sem usar o endpoint de análise. Trocar de modo desliga a câmera e limpa a visualização anterior. Veja [MIRROR.md](MIRROR.md) para preparação, privacidade e diferenças em relação à captura descrita aqui.
