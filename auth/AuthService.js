const bcrypt = require('bcrypt');
const db = require('../db');

class AuthService {
  async authenticate(email, password) {
    const rows = await new Promise((resolve, reject) => {
      db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });
    if (rows.length === 0) return null;

    const user = rows[0];
    if (!user.password) return null;


    let hash = user.password;
    if (hash.startsWith('$2y$')) {
      hash = '$2a$' + hash.slice(4);
    }

    const isMatch = await bcrypt.compare(password, hash);
    return isMatch ? user : null;
  }
}

module.exports = new AuthService();