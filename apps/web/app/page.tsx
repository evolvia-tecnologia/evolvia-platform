import Link from 'next/link';

export default function HomePage() {
  return <main className="shell">
    <header className="topbar">
      <div className="brand">EVOLVIA</div>
      <nav className="nav-actions">
        <Link className="btn-link" href="/login">Entrar</Link>
        <Link className="btn btn-primary" href="/cadastro">Criar conta</Link>
      </nav>
    </header>

    <section className="container hero">
      <div>
        <p className="event-status">EVOLVIA CORE v0.2</p>
        <h1>Seu evento começa com uma conversa.</h1>
        <p>A EVA faz perguntas simples, sugere as melhores configurações e ajuda você a construir seu evento sem depender de uma equipe técnica.</p>
        <div className="nav-actions" style={{ marginTop: 28 }}>
          <Link className="btn btn-primary" href="/cadastro">Começar meu evento</Link>
          <Link className="btn btn-secondary" href="/login">Já tenho conta</Link>
        </div>
      </div>

      <div className="hero-card">
        <div className="eva-bubble">Olá! Eu sou a EVA. Para começarmos, que tipo de evento você quer criar?</div>
        <div className="options-grid" aria-label="Exemplos de tipos de evento">
          <div className="option">Congresso ou evento científico</div>
          <div className="option">Evento corporativo ou treinamento</div>
          <div className="option">Feira ou exposição</div>
          <div className="option">Show ou entretenimento</div>
        </div>
      </div>
    </section>
  </main>;
}
