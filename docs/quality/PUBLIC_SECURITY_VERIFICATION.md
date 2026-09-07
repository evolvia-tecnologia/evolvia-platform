# Verificação pública de segurança

O comando abaixo valida, sem modificar o ambiente, o contrato público mínimo do Gate 1:

```bash
node scripts/verify-public-security-contract.mjs \
  https://dev.evolviatecnologia.com/ \
  http://dev.evolviatecnologia.com/
```

Ele exige HTTPS com status 200, redirecionamento HTTP para o mesmo host e os cabeçalhos HSTS, `nosniff`, política de referência e proteção contra enquadramento. Também recusa `X-Powered-By`, versões tecnológicas no cabeçalho `Server`, URLs locais, credenciais embutidas e redirecionamentos externos.

O verificador é somente leitura: não acessa secrets, não altera DNS, certificado, Nginx ou servidor e não substitui a homologação humana de acessibilidade. Saída zero indica apenas que o contrato automatizado foi observado naquele instante; a evidência deve registrar horário e SHA do código validado.
