# Gate 1 — timezone canônico do evento

## Problema

Datas eram persistidas como instantes UTC, mas preview e páginas públicas as apresentavam sempre em UTC. Isso permitia divergência perto da virada do dia e deixava Programação, inscrições e comunicação sem uma referência temporal canônica.

## Contrato implementado

- `Event.timeZone` é nullable durante o rollout expansivo e aceita apenas timezone IANA suportado pelo runtime.
- Offset fixo e zonas `Etc/GMT±N` são recusados.
- Eventos existentes não recebem backfill geográfico presumido.
- O Wizard exige confirmação explícita antes de concluir uma nova fundação.
- Instantes continuam em UTC no banco e no JSON ISO.
- Alterar o timezone não reinterpreta instantes persistidos e gera auditoria sanitizada `event.time_zone_changed`.
- O checklist impede nova publicação sem timezone confirmado.
- Catálogo, preview, página pública e orientação pública da EVA usam o mesmo timezone.
- Evento publicado legado sem timezone permanece compatível e é apresentado em UTC até regularização.

## Segurança e privacidade

Timezone é um fato público necessário à apresentação de datas. O contrato público continua sem tenant, IDs internos, Wizard ou auditoria. A auditoria registra apenas mudança de timezone e se já existiam datas, sem e-mail, token, hash, origem ou conteúdo editorial.

## Benchmark aplicado

O padrão útil é a consistência temporal ponta a ponta observada em plataformas maduras de eventos: uma única decisão do organizador alimenta descoberta, página pública e suporte. A solução mantém arquitetura, textos, componentes e fluxo próprios do Evolvia, sem copiar interface ou fluxo proprietário.

## Limites

Não cria agenda por sessão, deadlines da Fase 2, deploy ou backfill automático. Timezone por atividade permanece fora deste Gate.
