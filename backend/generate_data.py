import shapely
import geopandas as gpd

from pathlib import Path
from antimeridian import fix_polygon
from shapely.geometry.polygon import orient
from geopandas import GeoDataFrame
from equi7grid import get_standard_equi7grid, Equi7Grid

MAX_SEG_LEN = 20_000 # maximum segment length in meters for geometries displayed in the Web-Mercator projection

def generate_gdf(e7grid: Equi7Grid, continent: str, tiling_id: str | int, 
                 max_seg_len: int | None = None) -> gpd.GeoDataFrame:
    """Generate GeoDataframe in the LatLon projection containing all Equi7Grid tiles corresponding
    to the given continent and tiling ID.
    """
    gdf = e7grid[continent].to_geodataframe(tiling_ids = [tiling_id])
    if max_seg_len is not None:
        for i, row in gdf.iterrows():
            gdf.at[i, "geometry"] = shapely.segmentize(orient(row["geometry"]), max_segment_length=max_seg_len)
    gdf = gdf.to_crs(4326)
    new_rows = {"name": [], "geometry": []}
    for i, row in gdf.iterrows():
        poly_fixed = fix_polygon(row["geometry"], great_circle=True)
        if(poly_fixed.geom_type == "Polygon"):
            polys = [poly_fixed]
        else:
            polys = poly_fixed.geoms
        
        for poly in polys:
            new_rows["name"].append(row["name"])
            new_rows["geometry"].append(poly)

    return GeoDataFrame(new_rows, crs=4326)


def generate_grids():
    """Generate GeoDataframe in the LatLon projection containing all standard Equi7Grid tiles. 
    The function fills the data folder of the project repository and performs segmentation for 
    2D data, but not 3D.
    """
    continents = ["AF", "AN", "AS", "EU", "NA", "OC", "SA"]
    tilings = ["T6", "T3", "T1"]
    for tiling in tilings:
        for continent in continents:
            e7grid = get_standard_equi7grid(500)
            gdf = generate_gdf(e7grid, continent, tiling, max_seg_len=None)
            filepath = Path(__file__).parent.parent / "data" / f"{continent}_{tiling}_cs.parquet"
            gdf.to_parquet(filepath)

            gdf = generate_gdf(e7grid, continent, tiling, max_seg_len=MAX_SEG_LEN)
            filepath = Path(__file__).parent.parent / "data" / f"{continent}_{tiling}_ol.parquet"
            gdf.to_parquet(filepath)


if __name__ == "__main__":
    generate_grids()