<script>
    import { onMount } from "svelte";
    import ModelCard from "./ModelCard.svelte";

    let models = [];
    let loading = true;
    let error = null;
    onMount(async () => {
        console.log("Fetching models...");
        try {
            const response = await fetch("https://fmapi.swissai.cscs.ch/models");
            const data = await response.json();
            models = data.data.map(model => ({
                data: {
                    title: model.id,
                    description: model.id,
                },
            }));
        } catch (error) {
            console.error("Error fetching models:", error);
            error = error.message;
        }
        finally {
            loading = false;
        }
    });
</script>

<div>
    {#if loading}
        <div class="loading">Loading posts...</div>
    {:else if error}
    <div class="error">
      Error loading posts: {error}
    </div>
    {:else}
    <div class="model-list space-y-2">
        {#each models as model}
            <ModelCard entry={model} />
        {/each}
    </div>
    {/if}
</div>

<style>
/* Optional styling */
</style>