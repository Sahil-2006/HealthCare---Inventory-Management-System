-- Adds application authentication for existing MEDRIPPLE database volumes.
USE medripple;

CREATE TABLE IF NOT EXISTS app_users (
    user_id              CHAR(36) PRIMARY KEY,
    full_name            VARCHAR(120) NOT NULL,
    email                VARCHAR(254) NOT NULL UNIQUE,
    password_hash        VARCHAR(255) NOT NULL,
    role                 ENUM('VIEWER','OPERATOR','APPROVER','ADMIN') NOT NULL DEFAULT 'OPERATOR',
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at        TIMESTAMP NULL
);

INSERT INTO app_users (user_id, full_name, email, password_hash, role, is_active)
VALUES (
    'demo-approver-001',
    'Demo Approver',
    'demo.approver@medripple.demo',
    'scrypt$bWVkcmlwcGxlLWRlbW8tMjAyNg$tiwYmJXvsZUqJ4T9pnhprY4Ky8wHIZ4hATpeymIHCdukfMIkblAFGoZtE1gZTgPBnURTS4Apl6fHNe3NVI_XjQ',
    'APPROVER',
    TRUE
)
ON DUPLICATE KEY UPDATE user_id = VALUES(user_id);
