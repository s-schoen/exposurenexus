export type AuthApplicationErrorCatalog = {
  "auth.credentials_session_create_failed": {
    kind: "unexpected"
    details: { username: string }
  }
  "auth.session_create_failed": {
    kind: "unexpected"
    details: { userId: string }
  }
  "auth.session_validate_failed": { kind: "unexpected" }
  "auth.session_revoke_failed": { kind: "unexpected" }
  "auth.permission_check_failed": {
    kind: "unexpected"
    details: { userId: string }
  }
}
