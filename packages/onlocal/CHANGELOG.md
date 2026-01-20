# onlocal

## 0.4.0

### Minor Changes

- 85a1b5f: feat: Add WebSocket passthrough support for HTTP tunneling

  This release adds full WebSocket passthrough capability to the HTTP tunneling system, allowing WebSocket connections to be tunneled through onlocal just like regular HTTP requests.

  ## What's New

  - **WebSocket passthrough**: External WebSocket connections to your tunnel URL are now forwarded to your local server
  - **Bidirectional frame relay**: Text and binary WebSocket frames are relayed in both directions
  - **Proper connection lifecycle**: WebSocket open, message, and close events are properly propagated

  ## Usage

  ```bash
  # Start a local WebSocket server on port 3000
  onlocal 3000

  # Connect from anywhere using WebSocket
  ws://your-tunnel-id.onlocal.dev/your-ws-endpoint
  ```

  ## Technical Details

  - New message types: `ws_open`, `ws_frame`, `ws_close` for WebSocket passthrough protocol
  - Uses Cloudflare Durable Objects' hibernating WebSocket API for efficient connection management
  - Supports multiple concurrent WebSocket connections per tunnel

## 0.3.0

### Minor Changes

- c77387a: Added proper install.sh and updated --help for onlocal cli

## 0.2.0

### Minor Changes

- 2c2d6b7: Removed pinging client to keep connection alive, allows for proper DO hibernation

## 0.1.0

### Minor Changes

- 15d6a74: Added proper CI workflow && Removed the ping sent from the DO server that keeps websocket alive for long, takes advantage of DO hypernation instead
