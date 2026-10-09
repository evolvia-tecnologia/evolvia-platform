-- Evento publicado pode sair da vitrine e continuar acessível pelo link direto.
-- Coluna aditiva; o padrão true preserva os eventos já publicados.

ALTER TABLE "EventPublication" ADD COLUMN "catalogListed" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Event" ADD COLUMN "catalogListed" BOOLEAN NOT NULL DEFAULT true;
