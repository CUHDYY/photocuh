
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Use POST to remove an object."
    });
  }

  const apiKey = process.env.FAL_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "AI key is missing. Check Vercel Environment Variables."
    });
  }

  try {
    const { imageData, maskData } = req.body || {};

    if (
      typeof imageData !== "string" ||
      typeof maskData !== "string" ||
      !imageData.startsWith("data:image/") ||
      !maskData.startsWith("data:image/")
    ) {
      return res.status(400).json({
        error: "Please upload an image and select the object to remove."
      });
    }

    const response = await fetch(
      "https://fal.run/fal-ai/object-removal/mask",
      {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          image_url: imageData,
          mask_url: maskData,
          model: "best_quality",
          mask_expansion: 15
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("fal.ai request failed:", response.status);

      return res.status(502).json({
        error: "The AI service could not process the image. Try again."
      });
    }

    if (!result.images?.[0]?.url) {
      return res.status(502).json({
        error: "The AI did not return an edited image."
      });
    }

    return res.status(200).json({
      imageUrl: result.images[0].url
    });
  } catch (error) {
    console.error("Object removal failed:", error.message);

    return res.status(500).json({
      error: "Something went wrong while cleaning the image."
    });
  }
}
