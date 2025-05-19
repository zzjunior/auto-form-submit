const bcrypt = require('bcrypt');
const db = require('../db');

class AuthService {
  async authenticate(email, password) {
    const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) return null;

    const user = rows[0];
    if (!user.password) return null;

    // Corrige prefixo do hash para compatibilidade com bcrypt do Node.js
    let hash = user.password;
    if (hash.startsWith('$2y$')) {
      hash = '$2a$' + hash.slice(4);
    }

    const isMatch = await bcrypt.compare(password, hash);
    return isMatch ? user : null;
  }
}

module.exports = new AuthService();