import { VehicleData, PartResult, SearchStep } from "../types";
import { apiPost } from "./apiClient";

export async function decodeVin(
  vin: string,
  onProgress: (step: SearchStep, message: string) => void
): Promise<VehicleData> {
  onProgress("verifying", "Verifying VIN format...");
  await new Promise((r) => setTimeout(r, 250));

  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
    throw new Error("Invalid VIN format. VIN must be 17 characters (letters/numbers, excluding I, O, Q).");
  }

  onProgress("accessing_nhtsa", "Decoding VIN via NHTSA...");
  const data = await apiPost<VehicleData>("/api/decodeVin", { vin });

  onProgress("finalizing", "Finalizing vehicle profile...");
  await new Promise((r) => setTimeout(r, 150));
  return data;
}

export async function searchParts(vehicle: VehicleData, query: string): Promise<PartResult[]> {
  return apiPost<PartResult[]>("/api/searchParts", { vehicle, query });
}

export async function compareParts(vehicle: VehicleData, parts: PartResult[]): Promise<{ markdown: string }> {
  return apiPost<{ markdown: string }>("/api/compareParts", { vehicle, parts });
}
