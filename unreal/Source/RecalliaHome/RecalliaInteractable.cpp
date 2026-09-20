#include "RecalliaInteractable.h"
#include "Components/PrimitiveComponent.h"
#include "GameFramework/Actor.h"

void URecalliaInteractable::SetHighlighted(bool bOn)
{
	TArray<UPrimitiveComponent*> Prims;
	if (AActor* Owner = GetOwner())
	{
		Owner->GetComponents<UPrimitiveComponent>(Prims);
	}
	for (UPrimitiveComponent* P : Prims)
	{
		P->SetRenderCustomDepth(bOn);
		P->SetCustomDepthStencilValue(bOn ? 1 : 0);
	}
}
