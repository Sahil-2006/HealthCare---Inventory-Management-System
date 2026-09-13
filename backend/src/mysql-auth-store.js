const mysql = require('mysql2/promise');
const { AppError } = require('./errors');
const { createPoolOptions } = require('./mysql-store');

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role,
    active: Number(row.active) === 1,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt
  };
}

function createMysqlAuthStore(config, dependencies = {}) {
  const pool = dependencies.pool || mysql.createPool(createPoolOptions(config));

  async function query(sql, values = []) {
    try {
      const [rows] = await pool.query(sql, values);
      return rows;
    } catch (error) {
      throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The MEDRIPPLE database is unavailable. Check the MySQL connection and run the database seed.', { databaseCode: error.code });
    }
  }

  return {
    source: 'MYSQL',
    async findByEmail(email) {
      const rows = await query(
        `SELECT user_id AS id, full_name AS name, email, password_hash AS passwordHash,
                role, is_active AS active, created_at AS createdAt
         FROM app_users WHERE email = ? LIMIT 1`,
        [email]
      );
      return mapUser(rows[0]);
    },
    async create(user) {
      try {
        await pool.execute(
          `INSERT INTO app_users (user_id, full_name, email, password_hash, role, is_active)
           VALUES (?, ?, ?, ?, ?, TRUE)`,
          [user.id, user.name, user.email, user.passwordHash, user.role]
        );
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          throw new AppError(409, 'ACCOUNT_EXISTS', 'An account already exists for this email address.');
        }
        throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The MEDRIPPLE database could not create the account.', { databaseCode: error.code });
      }
      return user;
    },
    async recordLogin(userId) {
      await query('UPDATE app_users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = ?', [userId]);
    },
    async close() {
      await pool.end();
    }
  };
}

module.exports = { createMysqlAuthStore, mapUser };
