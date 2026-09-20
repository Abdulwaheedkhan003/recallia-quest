# Recallia Quest — 3D Home in Unreal Engine

The 3D home is an **Unreal Engine 5.5** application streamed into the web app with **Pixel Streaming**.
The web app (Home Simulation → “3D home”) shows the stream and performs every real action
(routine completion, reminders, medication check-offs, opening Songs/Friends/Stories…) through the
normal authenticated API. Unreal only renders the house and reports what the person touched.

> These C++ sources were written against the UE 5.5 Pixel Streaming API but have **not been compiled
> in this repository's CI** (Unreal cannot run there). Build them once in the editor as described below.

## 1. Create the Unreal project
1. Unreal Engine 5.5 → New Project → *Games → Blank*, **C++**, name it `RecalliaHome`.
2. Copy `unreal/Source/RecalliaHome/*` into `<YourProject>/Source/RecalliaHome/` (replace the generated files).
3. Edit → Plugins → enable **Pixel Streaming** → restart the editor, then build (Visual Studio / Rider / `Build.bat`).

## 2. Build the level
- Model the home with these rooms: bedroom, bathroom, kitchen, living, dining, entrance, medicine.
- For each room place a **RecalliaRoomVolume** and set `RoomId`.
- For each touchable object add a **RecalliaInteractable** component and set `RoomId` + `ObjectId`.
  The ids **must** match `unreal/objects.json` (regenerate it with `npm run unreal:ids` whenever `rooms.ts` changes).
- GameMode → Player Controller Class = **RecalliaPlayerController**.
- Optional: add a post-process outline material using Custom Depth stencil 1 for the highlight glow.
- Optional (Blueprint): implement `OnRecalliaInit(Language, PersonName)` and `OnRecalliaResult(ObjectId, bOk, Message)`
  on a Blueprint child of the controller to show the person's name and a floating “Well done!” in the world.

## 3. Package and stream
1. Package for Windows or Linux (Shipping).
2. Run the signalling server from Epic's **PixelStreamingInfrastructure** (branch matching 5.5):
   `SignallingWebServer/platform_scripts/cmd/start.bat` (or `bash/start.sh`) — note its player WebSocket URL (default `ws://<host>:80`).
3. Start the packaged game on a GPU machine:
   `RecalliaHome.exe -PixelStreamingURL=ws://localhost:8888 -RenderOffScreen -AudioMixer -ForceRes -ResX=1920 -ResY=1080`
4. In the Recallia server's `.env` set:
   ```
   UNREAL_SIGNALLING_URL=wss://your-signalling-host   # the URL browsers connect to
   ```
   Restart Recallia. Home Simulation now shows **3D home** (with “Simple home” still available as a fallback).
   For internet use put the signalling server behind HTTPS/WSS and configure a TURN server in PixelStreamingInfrastructure.

## Message protocol (JSON over the Pixel Streaming data channel)
| Direction | Message |
|---|---|
| Unreal → web | `{"type":"ready"}` |
| Unreal → web | `{"type":"enterRoom","room":"kitchen"}` |
| Unreal → web | `{"type":"interact","room":"bathroom","object":"toothbrush"}` |
| web → Unreal | `{"type":"init","lang":"hi","name":"Meera","rooms":{"bathroom":{"label":"…","objects":{"toothbrush":"…"}}}}` (labels already translated) |
| web → Unreal | `{"type":"result","object":"toothbrush","ok":true,"message":"Well done! …"}` |

Unreal → web uses `UPixelStreamingInput::SendPixelStreamingResponse`; web → Unreal uses the frontend's
`emitUIInteraction`, received by `UPixelStreamingInput::OnInputEvent`.
