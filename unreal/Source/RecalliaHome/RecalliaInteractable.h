#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "RecalliaInteractable.generated.h"

/**
 * Add to any actor in the level that the person can touch (toothbrush, stove, pill box…).
 * RoomId / ObjectId must match unreal/objects.json (generated from the web app's rooms.ts),
 * because the web app performs the real action (routine completion, reminder, etc.).
 */
UCLASS(ClassGroup = (Recallia), meta = (BlueprintSpawnableComponent))
class RECALLIAHOME_API URecalliaInteractable : public UActorComponent
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Recallia")
	FName RoomId;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Recallia")
	FName ObjectId;

	/** Glow outline via Custom Depth (pair with a post-process outline material in the level). */
	UFUNCTION(BlueprintCallable, Category = "Recallia")
	void SetHighlighted(bool bOn);
};
