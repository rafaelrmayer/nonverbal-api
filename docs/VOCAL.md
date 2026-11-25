# Módulo vocal: medidas acústicas

A aba **Voz e áudio** aceita arquivo WAV ou gravação pelo microfone. Selecionar um arquivo cria uma prévia local. Gravar pede permissão somente após o clique; não solicita câmera. O AudioWorklet acumula PCM mono por até 30 s, sem reproduzir a entrada nos alto-falantes. Após parar, o áudio pode ser ouvido localmente. **Analisar áudio** envia uma cópia à API; não há envio durante a gravação ou por selecionar arquivo.

Trocar de modo/fonte, limpar, ocultar ou sair da página interrompe tracks, desconecta o grafo, fecha AudioContext, invalida callbacks tardios, limpa dados e revoga o blob da prévia. Uma permissão concedida depois da troca tem seus tracks encerrados imediatamente. O limite de amostras é aplicado no processador, além do timer da interface. Gravações não são armazenadas em localStorage, arquivos ou banco pelo código da aplicação. Metadados HTTP podem ser registrados pelo provedor de hospedagem segundo sua configuração.

## Endpoint e limites

`POST /v1/vocal/analyze` recebe bytes `audio/wav` ou `audio/x-wav`: WAV PCM16 não comprimido, 1 ou 2 canais, 8–48 kHz, duração positiva até 30 segundos e até 8 MiB. MP3/AAC/WebM, URL, base64 e multipart não são aceitos. Arquivo inválido/truncado ou formato/duração incompatível retorna 422; tipo errado 415; mais de 8 MiB 413; envio acima de 10 s 408. O limite compartilhado com corpo/facial permite uma análise por processo e devolve 429 com Retry-After quando ocupado. Não depende dos modelos visuais. As respostas usam no-store, e o processamento ocorre em memória, sem reenvio a outra empresa de inferência.

```bash
curl -X POST https://nonverbal-api.onrender.com/v1/vocal/analyze \
  -H 'Content-Type: audio/wav' --data-binary @amostra-autorizada.wav
```

## Método e significado

`algorithm=pcm-autocorrelation-v1`, `experimental=true`. É processamento de sinal com NumPy, sem modelo aprendido, transcrição ou classificação de emoção, identidade, intenção, hesitação ou diagnóstico.

- A entrada é normalizada dividindo PCM16 por 32768. Estéreo é convertido pela média dos canais; sinais em oposição de fase podem cancelar. Recomenda-se mono para comparação.
- `rms_dbfs` é 20 log10 do RMS da amostra mono; `peak_dbfs` usa o maior módulo dos canais originais. Piso numérico −120 dBFS. Não são dB SPL, intensidade física, qualidade da voz ou medidas calibradas de volume no ambiente.
- `clipped_sample_fraction` indica a fração de amostras dos canais originais com módulo ≥0,999: proximidade ao limite digital, sem comprovar distorção. A interface apresenta esse significado, não diagnóstico de clipping.
- A curva de RMS usa blocos de aproximadamente 20 ms, com no máximo 1.500 pontos. `low_energy_intervals` marca trechos abaixo de −40 dBFS por pelo menos 0,20 s, incluindo início/fim da gravação. Baixa energia pode corresponder a pausas, mas não é detector de fala ou hesitação. Ruído, ganho, distância do microfone e silêncio nas bordas afetam o resultado.
- Frequência fundamental estimada: quadros de 40 ms, passo de aproximadamente 20 ms, remoção da média e autocorrelação normalizada pela energia de sobreposição via FFT. Busca picos correspondentes a 70–800 Hz; exige RMS do quadro sem DC ≥0,01, correlação ≥0,65 e menos de 1% de amostras próximas ao limite digital. Entre picos quase equivalentes (≥95% do melhor), prioriza o primeiro; faz interpolação parabólica local e retorna a mediana das estimativas válidas.
- Sem periodicidade suficiente, `pitch_median_hz=null` e `pitch_reason=insufficient_periodicity`. `periodic_frame_count` conta quadros com estimativa, não palavras, sílabas ou duração de fala. Tons e música também são periódicos; pode haver erros de oitava/sub-harmônicos e resultados enganosos em ruído ou frequências fora da faixa. Não valida uma voz, emoção, gênero, idade ou condição de saúde.

O microfone solicita desativar ganho automático, supressão de ruído e cancelamento de eco, mas navegador/dispositivo podem ignorar essas preferências ou processar o sinal por hardware. Comparações entre aparelhos/gravações não são calibradas. Não há fusão temporal com o vídeo nesta versão.

## Verificação

Testes geram tons conhecidos, silêncio, ruído, saturação e estéreo em oposição de fase. Conferem frequência/RMS, abstenção, intervalos, duração e limites em várias taxas, WAV truncado/errado, resposta HTTP e concorrência compartilhada. O AudioWorklet é testado com amostras sintéticas para limite de 30 s, flush e saída silenciosa. O navegador em CI usa WAV sintético e microfone falso, verificando ausência de POST antes de analisar, tracks encerrados, permissão tardia, descarte ao sair e recusa de permissão.

Esses testes não medem precisão em vozes reais. Após implantar, conferir microfone real, gravação/parada/prévia, upload explícito, silêncio, amostra autorizada e funcionamento no celular. Um resultado indeterminado não equivale a ausência de voz.
