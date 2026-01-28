import geopandas as gpd
from pathlib import Path
import shapely
from equi7grid import get_standard_equi7grid
from antimeridian import fix_polygon
from shapely.geometry.polygon import orient
from geopandas import GeoDataFrame

MAX_SEG_LEN = 20_000

def limit_geog_poly(geom: shapely.Geometry) -> shapely.Geometry:
    limits_poly = shapely.Polygon([(-179.9, -84), (179.9, -84), (179.9, 84), (-179.9, 84)])
    return shapely.intersection(geom, limits_poly)

def generate_gdf(e7grid, continent, tiling_id) -> gpd.GeoDataFrame:
    gdf = e7grid[continent].to_geodataframe(tiling_ids = [tiling_id])
    for i, row in gdf.iterrows():
        gdf.at[i, "geometry"] = shapely.segmentize(orient(row["geometry"]), max_segment_length=MAX_SEG_LEN)
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
    continents = ["AF", "AN", "AS", "EU", "NA", "OC", "SA"]
    tilings = ["T6", "T3", "T1"]
    for tiling in tilings:
        for continent in continents:
            e7grid = get_standard_equi7grid(500)
            gdf = generate_gdf(e7grid, continent, tiling)
            filepath = Path(__file__).parent.parent / "data" / f"{continent}_{tiling}.parquet"
            gdf.to_parquet(filepath)


if __name__ == "__main__":
    generate_grids()