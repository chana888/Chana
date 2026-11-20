package security

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"chana/internal/database"
)

// 设备凭据独立于短期会话，活跃使用时续期；数据库只保存凭据摘要。
const TrustedDeviceLifetime = 180 * 24 * time.Hour

var ErrInvalidTrustedDevice = errors.New("设备登录已失效")

func initTrustedDevices(db *database.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS auth_trusted_devices (
		token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL,
		password_version TEXT NOT NULL, issued_at INTEGER NOT NULL,
		expires_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_auth_trusted_devices_user ON auth_trusted_devices(user_id);`)
	return err
}

func passwordVersion(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func validDeviceToken(token string) bool {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	return err == nil && len(raw) == 32 && base64.RawURLEncoding.EncodeToString(raw) == token
}

// RememberDevice 仅接受已经通过密码验证的有效会话。
func (a *AuthManager) RememberDevice(sessionToken string) (string, time.Time, error) {
	a.deviceMu.Lock()
	defer a.deviceMu.Unlock()
	session, ok := a.ValidateToken(sessionToken)
	if !ok {
		return "", time.Time{}, ErrInvalidTrustedDevice
	}
	a.mu.RLock()
	db := a.db
	a.mu.RUnlock()
	if db == nil {
		return "", time.Time{}, ErrInvalidTrustedDevice
	}
	user, err := db.GetRBACUserByID(session.UserID)
	if err != nil || !user.Enabled || passwordVersion(user.PasswordHash) != session.credentialVersion {
		return "", time.Time{}, ErrInvalidTrustedDevice
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	now := time.Now()
	expiresAt := now.Add(TrustedDeviceLifetime)
	_, err = db.Exec(`INSERT INTO auth_trusted_devices
		(token_hash,user_id,password_version,issued_at,expires_at,last_used_at) VALUES (?,?,?,?,?,?)`,
		passwordVersion(token), user.ID, session.credentialVersion, now.Unix(), expiresAt.Unix(), now.Unix())
	if err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

// RestoreTrustedDevice 每次从当前账号和权限生成会话，重启后仍然可用。
func (a *AuthManager) RestoreTrustedDevice(token string) (Session, time.Time, error) {
	if !validDeviceToken(token) {
		return Session{}, time.Time{}, ErrInvalidTrustedDevice
	}
	a.deviceMu.Lock()
	defer a.deviceMu.Unlock()
	a.mu.RLock()
	db := a.db
	a.mu.RUnlock()
	if db == nil {
		return Session{}, time.Time{}, ErrInvalidTrustedDevice
	}
	var userID, version string
	var expiry int64
	err := db.QueryRow(`SELECT user_id,password_version,expires_at FROM auth_trusted_devices WHERE token_hash=?`,
		passwordVersion(token)).Scan(&userID, &version, &expiry)
	if err != nil || time.Now().Unix() >= expiry {
		return Session{}, time.Time{}, ErrInvalidTrustedDevice
	}
	user, err := db.GetRBACUserByID(userID)
	if err != nil || !user.Enabled || version != passwordVersion(user.PasswordHash) {
		return Session{}, time.Time{}, ErrInvalidTrustedDevice
	}
	session, err := a.SessionForUsername(user.Username)
	if err != nil {
		return Session{}, time.Time{}, err
	}
	// 再检查版本，防止外部直接更新密码时恢复了旧凭据。
	if session.credentialVersion != version {
		a.RevokeToken(session.Token)
		return Session{}, time.Time{}, ErrInvalidTrustedDevice
	}
	now := time.Now()
	expiresAt := now.Add(TrustedDeviceLifetime)
	result, err := db.Exec(`UPDATE auth_trusted_devices SET expires_at=?,last_used_at=?
		WHERE token_hash=? AND password_version=? AND expires_at>?`,
		expiresAt.Unix(), now.Unix(), passwordVersion(token), version, now.Unix())
	if err != nil {
		a.RevokeToken(session.Token)
		return Session{}, time.Time{}, err
	}
	count, err := result.RowsAffected()
	if err != nil || count != 1 {
		a.RevokeToken(session.Token)
		return Session{}, time.Time{}, ErrInvalidTrustedDevice
	}
	return session, expiresAt, nil
}

func (a *AuthManager) RevokeTrustedDevice(token string) error {
	if !validDeviceToken(token) {
		return nil
	}
	a.deviceMu.Lock()
	defer a.deviceMu.Unlock()
	a.mu.RLock()
	db := a.db
	a.mu.RUnlock()
	if db == nil {
		return ErrInvalidTrustedDevice
	}
	_, err := db.Exec(`DELETE FROM auth_trusted_devices WHERE token_hash=?`, passwordVersion(token))
	return err
}

// 供 Harness 的每次反代鉴权使用，检查当前账号而不额外创建短期会话。
func (a *AuthManager) TrustedDeviceUserID(token string) (string, bool) {
	if !validDeviceToken(token) {
		return "", false
	}
	a.deviceMu.Lock()
	defer a.deviceMu.Unlock()
	a.mu.RLock()
	db := a.db
	a.mu.RUnlock()
	if db == nil {
		return "", false
	}
	var userID, version string
	var expiry int64
	if err := db.QueryRow(`SELECT user_id,password_version,expires_at FROM auth_trusted_devices WHERE token_hash=?`, passwordVersion(token)).Scan(&userID, &version, &expiry); err != nil || expiry <= time.Now().Unix() {
		return "", false
	}
	user, err := db.GetRBACUserByID(userID)
	if err != nil || !user.Enabled || version != passwordVersion(user.PasswordHash) {
		return "", false
	}
	return user.ID, true
}
