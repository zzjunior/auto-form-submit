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