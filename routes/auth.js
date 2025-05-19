const express = require('express');
const router = express.Router();
const authService = require('../auth/AuthService');

router.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Login</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        body { background: #f8f9fa; }
        .login-container {
          max-width: 400px;
          margin: 8vh auto;
          padding: 32px 24px;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        @media (max-width: 500px) {
          .login-container {
            padding: 18px 8px;
            margin: 4vh 8px;
          }
        }
        footer {
          margin-top: 32px;
          text-align: center;
        }
        .alert-help {
          display: inline-flex;
          align-items: center;
          background: #fff3cd;
          color:rgb(216, 0, 0);
          border: 1px solid rgb(243, 232, 198);
          border-radius: 6px;
          padding: 10px 18px;
          font-size: 1rem;
          margin-top: 12px;
        }
        .alert-help svg {
          margin-right: 8px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="login-container">
          <h2 class="mb-4 text-center">Login</h2>
          <form method="post" action="/login">
            <div class="mb-3">
              <label for="email" class="form-label">E-mail</label>
              <input type="email" class="form-control" id="email" name="email" placeholder="Digite seu e-mail" required />
            </div>
            <div class="mb-3">
              <label for="password" class="form-label">Senha</label>
              <input type="password" class="form-control" id="password" name="password" placeholder="Digite sua senha" required />
            </div>
            <button type="submit" class="btn btn-primary w-100">Entrar</button>
          </form>
        </div>
        <footer>
          <div class="alert-help shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 16 16">
              <path d="M7.938 2.016a.13.13 0 0 1 .125 0l6.857 11.856c.03.052.03.116 0 .168a.13.13 0 0 1-.125.064H1.205a.13.13 0 0 1-.125-.064.145.145 0 0 1 0-.168L7.938 2.016zm.823-1.447a1.13 1.13 0 0 0-1.624 0L.28 12.425C-.36 13.44.388 14.75 1.57 14.75h12.86c1.182 0 1.93-1.31 1.29-2.325L8.76.569z"/>
              <path d="M7.002 11a1 1 0 1 0 2 0 1 1 0 0 0-2 0zm.93-6.481a.5.5 0 0 1 .992 0l-.35 4.5a.5.5 0 0 1-.992 0l-.35-4.5z"/>
            </svg>
            É preciso um login do <a href="https://help.teia.com.br" target="_blank" class="text-decoration-none">Help TEIA</a> para utilizar a ferramenta...
          </div>
        </footer>
      </div>
    </body>
    </html>
  `);
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.authenticate(email, password);
  if (!user) {
    return res.send('Login inválido');
  }
  req.session.user = user;
  res.redirect('/');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;