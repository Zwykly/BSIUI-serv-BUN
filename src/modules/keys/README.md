# keys (planned)

Reserved for the end-to-end encryption (E2EE) extension. Nothing is implemented yet.

Planned scope:

- Public key directory: each user uploads a public identity key (and pre-keys);
  other clients fetch it to encrypt for them. Private keys never leave the client.
- The server keeps storing `message.msg` as an opaque string. With E2EE it will
  hold ciphertext, so the message endpoints should not need to change.
- Needs a new table (e.g. `user_key`) and endpoints (e.g. `PUT /keys`, `GET /keys/:username`).

**Cross-compatibility:** the Python backend (BSIUI-Serv) must implement the same
table, endpoints and payload formats, so both servers keep working on one database.
Keep any change here mirrored there.
