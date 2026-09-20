#include "RecalliaPlayerController.h"
#include "RecalliaInteractable.h"
#include "PixelStreamingInputComponent.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

ARecalliaPlayerController::ARecalliaPlayerController()
{
	bShowMouseCursor = true;
	bEnableClickEvents = true;
	bEnableTouchEvents = true;
	PixelInput = CreateDefaultSubobject<UPixelStreamingInput>(TEXT("PixelStreamingInput"));
}

void ARecalliaPlayerController::BeginPlay()
{
	Super::BeginPlay();
	if (PixelInput)
	{
		PixelInput->OnInputEvent.AddDynamic(this, &ARecalliaPlayerController::HandleWebMessage);
	}
	TSharedRef<FJsonObject> Ready = MakeShared<FJsonObject>();
	Ready->SetStringField(TEXT("type"), TEXT("ready"));
	Send(Ready);
}

void ARecalliaPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	InputComponent->BindKey(EKeys::LeftMouseButton, IE_Pressed, this, &ARecalliaPlayerController::HandleClick);
	InputComponent->BindTouch(IE_Pressed, this, &ARecalliaPlayerController::HandleTouch);
}

void ARecalliaPlayerController::HandleClick()
{
	FHitResult Hit;
	if (GetHitResultUnderCursor(ECC_Visibility, false, Hit)) SelectUnder(Hit);
}

void ARecalliaPlayerController::HandleTouch(ETouchIndex::Type FingerIndex, FVector)
{
	FHitResult Hit;
	if (GetHitResultUnderFinger(FingerIndex, ECC_Visibility, false, Hit)) SelectUnder(Hit);
}

void ARecalliaPlayerController::SelectUnder(const FHitResult& Hit)
{
	AActor* Actor = Hit.GetActor();
	URecalliaInteractable* Item = Actor ? Actor->FindComponentByClass<URecalliaInteractable>() : nullptr;
	if (!Item) return;
	if (Highlighted.IsValid()) Highlighted->SetHighlighted(false);
	Item->SetHighlighted(true);
	Highlighted = Item;

	TSharedRef<FJsonObject> Msg = MakeShared<FJsonObject>();
	Msg->SetStringField(TEXT("type"), TEXT("interact"));
	Msg->SetStringField(TEXT("room"), Item->RoomId.ToString());
	Msg->SetStringField(TEXT("object"), Item->ObjectId.ToString());
	Send(Msg);
}

void ARecalliaPlayerController::NotifyEnterRoom(FName RoomId)
{
	TSharedRef<FJsonObject> Msg = MakeShared<FJsonObject>();
	Msg->SetStringField(TEXT("type"), TEXT("enterRoom"));
	Msg->SetStringField(TEXT("room"), RoomId.ToString());
	Send(Msg);
}

void ARecalliaPlayerController::Send(const TSharedRef<FJsonObject>& Obj)
{
	if (!PixelInput) return;
	FString Out;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
	FJsonSerializer::Serialize(Obj, Writer);
	PixelInput->SendPixelStreamingResponse(Out);
}

void ARecalliaPlayerController::HandleWebMessage(const FString& Descriptor)
{
	TSharedPtr<FJsonObject> Msg;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Descriptor), Msg) || !Msg.IsValid()) return;
	const FString Type = Msg->GetStringField(TEXT("type"));
	if (Type == TEXT("init"))
	{
		OnRecalliaInit(Msg->GetStringField(TEXT("lang")), Msg->GetStringField(TEXT("name")));
	}
	else if (Type == TEXT("result"))
	{
		OnRecalliaResult(FName(*Msg->GetStringField(TEXT("object"))), Msg->GetBoolField(TEXT("ok")), Msg->GetStringField(TEXT("message")));
	}
}
