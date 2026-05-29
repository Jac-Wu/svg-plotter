import { INode } from "svgson";
import { ConvertSVGOptions, SVGMetaData } from "./types";
export declare function getSVGMetadata(parsedSVG: INode): SVGMetaData;
export interface ConvertSVGOutput {
    geojson: GeoJSON.FeatureCollection;
    errors: string[];
}
export declare function convertSVG(input: string, options?: ConvertSVGOptions): ConvertSVGOutput;
export { TransformState, GeoJSONTransformResult, createTransformState, translateGeoJSON, scaleGeoJSON, rotateGeoJSON, getGeoJSONBBox, coordToMercator, mercatorToCoord, } from "./geo-transform";
export { MapAdapter, MapPixel } from "./map-adapter";
export { DragHandler } from "./drag-handler";
