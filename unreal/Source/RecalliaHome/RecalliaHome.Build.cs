// Unreal Engine 5.5 module for the Recallia Quest 3D home (streamed to the web app with Pixel Streaming).
using UnrealBuildTool;

public class RecalliaHome : ModuleRules
{
	public RecalliaHome(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "InputCore", "Json", "JsonUtilities", "PixelStreaming" });
	}
}
