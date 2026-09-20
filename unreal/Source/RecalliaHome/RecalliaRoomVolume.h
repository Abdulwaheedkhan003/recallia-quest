#pragma once

#include "CoreMinimal.h"
#include "Engine/TriggerBox.h"
#include "RecalliaRoomVolume.generated.h"

/** Place one per room; tells the web app which room the person walked into. */
UCLASS()
class RECALLIAHOME_API ARecalliaRoomVolume : public ATriggerBox
{
	GENERATED_BODY()

public:
	ARecalliaRoomVolume();

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Recallia")
	FName RoomId;

private:
	UFUNCTION()
	void OnEnter(AActor* OverlappedActor, AActor* OtherActor);
};
