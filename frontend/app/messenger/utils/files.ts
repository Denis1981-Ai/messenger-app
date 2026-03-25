import { MAX_FILE_SIZE_BYTES, MAX_IMAGE_WIDTH, STORAGE_WARNING_MESSAGE } from "../constants";
import { Attachment } from "../types";
import { createId, getSerializedSize } from "./format";

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Ошибка чтения файла"));
    reader.readAsDataURL(blob);
  });

export const compressImageFile = async (file: File) => {
  const originalDataUrl = await blobToDataUrl(file);

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Ошибка обработки изображения"));
    img.src = originalDataUrl;
  });

  const scale = Math.min(1, MAX_IMAGE_WIDTH / Math.max(image.width, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Ошибка обработки изображения");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let resultDataUrl = originalDataUrl;
  const outputType = file.type || "image/png";

  if (outputType === "image/jpeg" || outputType === "image/webp") {
    let quality = 0.82;
    resultDataUrl = canvas.toDataURL(outputType, quality);

    while (getSerializedSize(resultDataUrl) > MAX_FILE_SIZE_BYTES && quality > 0.45) {
      quality -= 0.08;
      resultDataUrl = canvas.toDataURL(outputType, quality);
    }
  } else {
    resultDataUrl = canvas.toDataURL(outputType);
  }

  return {
    fileData: resultDataUrl,
    fileType: outputType,
    fileName: file.name || `image-${Date.now()}.png`,
    fileSize: getSerializedSize(resultDataUrl),
  };
};

export const fileToAttachment = async (file: File): Promise<Attachment> => {
  if (file.size > MAX_FILE_SIZE_BYTES && !file.type.startsWith("image/")) {
    throw new Error(STORAGE_WARNING_MESSAGE);
  }

  let fileData = "";
  let fileType = file.type || "application/octet-stream";
  let fileName = file.name || `file-${Date.now()}`;
  let fileSize = file.size;

  if (file.type.startsWith("image/")) {
    const processedImage = await compressImageFile(file);
    fileData = processedImage.fileData;
    fileType = processedImage.fileType;
    fileName = processedImage.fileName;
    fileSize = processedImage.fileSize;
  } else {
    fileData = await blobToDataUrl(file);
  }

  if (getSerializedSize(fileData) > MAX_FILE_SIZE_BYTES) {
    throw new Error(STORAGE_WARNING_MESSAGE);
  }

  return {
    id: createId(),
    fileName,
    fileType,
    fileData,
    fileSize,
  };
};
