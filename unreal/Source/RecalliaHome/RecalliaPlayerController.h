#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "RecalliaPlayerController.generated.h"

class UPixelStreamingInput;
class URecalliaInteractable;

/**
 * Bridges the 3D home and the Recallia web app over the Pixel Streaming data channel.
 *   Unreal -> web : {"type":"ready"} | {"type":"enterRoom","room":".."} | {"type":"interact","room":"..","object":".."}
 *   web -> Unreal : {"type":"init","lang":"..","name":"..","rooms":{..}} | {"type":"result","object":"..","ok":true,"message":".."}
 * Set this as the Player Controller Class in your GameMode.
 */
UCLASS()
class RECALLIAHOME_API ARecalliaPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	ARecalliaPlayerController();

	/** Send a room-entered event (called by ARecalliaRoomVolume). */
	void NotifyEnterRoom(FName RoomId);

	/** Blueprint hooks so designers can show the person's name, labels and feedback in the world. */
	UFUNCTION(BlueprintImplementableEvent, Category = "Recallia")
	void OnRecalliaInit(const FString& Language, const FString& PersonName);

	UFUNCTION(BlueprintImplementableEvent, Category = "Recallia")
	void OnRecalliaResult(FName ObjectId, bool bOk, const FString& Message);

protected:
	virtual void BeginPlay() override;
	virtual void SetupInputComponent() override;

private:
	UPROPERTY()
	TObjectPtr<UPixelStreamingInput> PixelInput;

	UPROPERTY()
	TWeakObjectPtr<URecalliaInteractable> Highlighted;

	void HandleClick();
	void HandleTouch(ETouchIndex::Type FingerIndex, FVector Location);
	void SelectUnder(const FHitResult& Hit);
	void Send(const TSharedRef<class FJsonObject>& Obj);

	UFUNCTION()
	void HandleWebMessage(const FString& Descriptor);
};
