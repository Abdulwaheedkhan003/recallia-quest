#include "RecalliaRoomVolume.h"
#include "RecalliaPlayerController.h"
#include "GameFramework/Pawn.h"

ARecalliaRoomVolume::ARecalliaRoomVolume()
{
	OnActorBeginOverlap.AddDynamic(this, &ARecalliaRoomVolume::OnEnter);
}

void ARecalliaRoomVolume::OnEnter(AActor*, AActor* OtherActor)
{
	const APawn* Pawn = Cast<APawn>(OtherActor);
	if (!Pawn) return;
	if (ARecalliaPlayerController* PC = Cast<ARecalliaPlayerController>(Pawn->GetController()))
	{
		PC->NotifyEnterRoom(RoomId);
	}
}
