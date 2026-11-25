# Vídeo e movimento local

No espelho da página inicial, **Origem do movimento** escolhe câmera ou arquivo. Arquivo aceita MP4, WebM ou MOV conforme o decoder do navegador: até 100 MiB, duração finita positiva até 60 segundos e até 4 milhões de pixels por frame. Arquivo corrompido, codec incompatível ou duração indeterminada é recusado antes do download dos modelos. Apenas escolher o arquivo não inicia inferência. O vídeo não solicita câmera.

Ao clicar em Iniciar vídeo, metadados são validados, módulos selecionados são preparados e a reprodução começa sem som. O mesmo worker do espelho processa os frames disponíveis, reduzidos a 640 pixels no lado maior. Não analisa todos os frames: mantém um por vez em processamento e espera pelo menos 125 ms entre análises. Vídeo e pontos exibidos pertencem ao mesmo frame. A velocidade depende do aparelho. Há Pausar/Continuar, sem seek na interface inicial.

A gravação não é enviada à API. Não há POST, upload, análise de áudio, gravação nova, histórico persistente ou endpoint HTTP de vídeo. Arquivo e quadros ficam no navegador. URLs blob temporárias são revogadas ao parar, trocar de fonte/experiência, ocultar ou sair da página. No final natural, o worker termina e o último frame processado e resultados permanecem visíveis até limpar/parar, iniciar outra sessão ou sair. Som e eventual trilha de áudio não são analisados. Corpo, mãos e rosto funcionam nos frames locais conforme seleção.

## Trajetórias e medidas

**Rastros de punhos e tornozelos** acompanha IDs corporais 15, 16, 27 e 28, apenas para uma pose detectada, usando os pontos já filtrados por visibilidade mínima e enquadramento. Cada ponto tem no máximo 32 amostras e janela de até dois segundos. Ao perder o ponto, perder a pose, detectar duas poses, retroceder o tempo ou ter intervalo superior a 0,75 s, não une amostras antigas às novas. Desmarcar rastros ou parar limpa a janela. Não reconhece identidades: uma pessoa substituindo outra sem intervalo detectável pode afetar o desenho; não é rastreamento de identidade.

Distância é o comprimento do caminho recente no plano da imagem, dividido pela diagonal do frame processado. Velocidade é a distância relativa entre as duas últimas amostras, dividida pelo tempo. Para arquivo, usa o tempo de reprodução; para câmera, relógio monotônico. Pausar o arquivo não acumula movimento. Não converte para metros nem indica atividade, postura correta, intenção ou condição clínica. Movimento da câmera, perspectiva e ruído do detector também alteram valores.

Com mais de uma pose, rastros e medidas são apagados para evitar mistura entre detecções. Contornos dos demais módulos continuam sendo desenhos do frame atual, sem associação persistente. Não há classificação de gestos temporais ou exportação de histórico nesta etapa.

## Verificação

Testes de lógica cobrem memória limitada, unidades, tempo fora de ordem, lacunas e ambiguidade, além dos limites de vídeo. CI gera um WebM sintético com ffmpeg, reproduz no navegador com os modelos reais, verifica pausa, conclusão, ausência de câmera/upload, rejeição de vídeo inválido e limpeza de blob. Pontos sintéticos verificam medidas/limpeza quando a pose se perde ou fica ambígua. Não são usados vídeos de pessoas na CI. Câmera real, precisão dos rastros e codecs/desempenho em celular precisam de conferência após implantação.
