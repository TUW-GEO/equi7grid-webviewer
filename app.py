
import argparse
import warnings
import pyproj
import shapely
import shapely.wkt as swkt
import geopandas as gpd

from pathlib import Path
from pyproj import Transformer
from flask import Flask, jsonify, render_template, request, Response
from pytileproj import ProjCoord
from pytileproj.projgeom import transform_coords, ProjGeom
from pytileproj.tiling_system import (
    RegularTilingDefinition,
)
from equi7grid import get_standard_equi7grid, get_user_equi7grid, Equi7Grid
from equi7grid._create_grids import get_system_definitions

from backend.generate_data import generate_gdf, generate_grids, MAX_SEG_LEN

EPSG_MAP = {continent: sysdef.crs for continent, sysdef in get_system_definitions().items()}
GRID_MAP = {}
STD_SAMPLING = 500
DEF_SEG_LEN_3857 = 10_000

app = Flask(__name__)

def get_std_tilings() -> dict[str, int]:
    """Get sampling look-up table for the standard tiling levels."""
    return {"T1": STD_SAMPLING, "T3": STD_SAMPLING, "T6": STD_SAMPLING}

STD_E7 = get_standard_equi7grid(get_std_tilings())

def get_e7grid(tiling_id: str | int) -> Equi7Grid:
    """Get Equi7Grid instance corresponding to the given tiling ID."""
    return STD_E7 if tiling_id in get_std_tilings() else GRID_MAP[tiling_id]

@app.route("/")
def index():
    return render_template("index.html")


def create_user_gdf(tile_size: int, tiling_id: str | int, continent: str, env: str) -> gpd.GeoDataFrame:
    """Create user-defined tiling."""
    if tiling_id in get_std_tilings():
        err_msg = "Tile size tag is already in use."
        raise ValueError(err_msg)
    if len(tiling_id) != 2:
        err_msg = "The tiling ID needs to have two characters."
        raise ValueError(err_msg)
    reg_tiling_def = RegularTilingDefinition(name=tiling_id, tile_shape=tile_size)
    e7grid = get_user_equi7grid({tiling_id: STD_SAMPLING}, {tiling_id: reg_tiling_def})
    max_seg_len = None if env == "cs" else MAX_SEG_LEN
    gdf = generate_gdf(e7grid, continent, tiling_id, max_seg_len=max_seg_len)
    GRID_MAP[tiling_id] = e7grid

    return gdf


def get_zone_polygons(continent: str, env: str) -> list[shapely.Polygon]:
    """Extract single zone polygons from a continent."""
    zone_poly = STD_E7[continent].proj_zone_geog.geom
    if env == "cs":
        limits_poly = shapely.Polygon([(-179.9, -84), (179.9, -84), (179.9, 84), (-179.9, 84)])
        zone_poly = shapely.intersection(zone_poly, limits_poly)
        
    if zone_poly.geom_type == "MultiPolygon":
        polygons = zone_poly.geoms
    else:
        polygons = [zone_poly]

    return polygons


@app.route("/createGeoms")
def create_geoms() -> Response:
    """Create tile and zone geometries."""
    continent = request.args.get("continent", "EU")
    tiling_id = request.args.get("tiling_id", None)
    tile_size = request.args.get("tile_size", None)
    tile_size = None if tile_size in ["", None] else int(tile_size) 
    env = request.args.get("env", "ol")

    if tiling_id is not None:
        if tile_size is not None:
            gdf = create_user_gdf(tile_size, tiling_id, continent, env)
        else:
            filepath = Path(__file__).parent / "data" / f"{continent}_{tiling_id}_{env}.parquet"
            gdf = gpd.read_parquet(filepath, columns=["name", "geometry"])
    else:
        zone_polygons = get_zone_polygons(continent, env)
        gdf = gpd.GeoDataFrame({"name": [continent] * len(zone_polygons), "geometry": zone_polygons}, crs=4326)
    
    return jsonify(gdf.__geo_interface__)


@app.route("/reprojectToEqui7")
def reproject_to_equi7() -> Response:
    """Reproject any coordinate to the Equi7Grid."""
    x = float(request.args["x"])
    y = float(request.args["y"])
    other_epsg = int(request.args["epsg"])
    
    proj_coord = ProjCoord(x=x, y=y, crs=pyproj.CRS.from_epsg(other_epsg))
    e7ts = STD_E7.get_systems_from_coord(proj_coord)[0]
    lon, lat = transform_coords(x, y, proj_coord.crs, 4326)
    e7_coord = e7ts.lonlat_to_xy(lon, lat)

    return jsonify({"x": e7_coord.x, "y": e7_coord.y, "epsg": e7_coord.crs.to_epsg()})


@app.route("/reprojectFromEqui7")
def reproject_from_equi7() -> Response:
    """Reproject Equi7Grid coordinate to other projection."""
    x = float(request.args["x"])
    y = float(request.args["y"])
    continent = request.args["continent"]
    other_epsg = int(request.args["epsg"])
    
    e7epsg = EPSG_MAP[continent]
    transformer = Transformer.from_crs(e7epsg, other_epsg, always_xy=True)
    x_other, y_other = transformer.transform(x, y)

    return jsonify({"x": x_other, "y": y_other})


@app.route("/queryTilesFromBbox")
def query_tiles_from_bbox() -> Response:
    """Query Equi7Grid tiles inside geographical bounding box."""
    east = float(request.args["east"])
    south = float(request.args["south"])
    west = float(request.args["west"])
    north = float(request.args["north"])
    tiling_id = request.args["tiling_id"]

    e7grid = get_e7grid(tiling_id)
    e7tiles = e7grid.get_tiles_in_geog_bbox([east, south, west, north], tiling_id=tiling_id)
    tilenames = [e7tile.name for e7tile in e7tiles]
    return jsonify(tilenames)


@app.route("/queryTilesFromWkt")
def query_tiles_from_wkt() -> Response:
    """Query Equi7Grid tiles inside a Web-Mercator geometry."""
    wkt = request.args["wkt"]
    tiling_id = request.args["tiling_id"]

    e7grid = get_e7grid(tiling_id)
    poly = shapely.segmentize(swkt.loads(wkt), DEF_SEG_LEN_3857)
    proj_geom = ProjGeom(geom=poly, crs=pyproj.CRS.from_epsg(3857))
    e7tiles = e7grid.get_tiles_in_geom(proj_geom=proj_geom, tiling_id=tiling_id)
    tilenames = [e7tile.name for e7tile in e7tiles]
    return jsonify(tilenames)


@app.route("/getGeoTraffo")
def get_traffo() -> Response:
    """Create GDAL's affine geotransformation parameters from a tilename."""
    tilename = request.args["tilename"]
    tiling_id = tilename[-2:]
    e7grid = get_e7grid(tiling_id)
    e7tile = e7grid.get_tile_from_name(tilename)
    return jsonify(e7tile.geotrans)


@app.route("/getTileDef")
def get_e7tile() -> Response:
    """Get JSON model of an Equi7Tile instance created from a tilename."""
    tilename = request.args["tilename"]
    tiling_id = tilename[-2:]
    e7grid = e7grid = get_e7grid(tiling_id)
    e7tile = e7grid.get_tile_from_name(tilename)
    e7tile.crs = e7tile.crs.to_proj4()
    tile_def = e7tile.model_dump()
    
    return jsonify(tile_def)


@app.route("/updateSampling")
def update_sampling() -> Response:
    """Update standard sampling and all grids."""
    global STD_SAMPLING
    global STD_E7
    global GRID_MAP

    try: 
        STD_SAMPLING = float(request.args["sampling"])
        STD_E7 = get_standard_equi7grid(get_std_tilings())

        for tiling_id in GRID_MAP.keys():
            reg_tiling_def = RegularTilingDefinition(name=tiling_id, tile_shape=GRID_MAP[tiling_id].EU[tiling_id].tile_size)
            e7grid = get_user_equi7grid({tiling_id: STD_SAMPLING}, {tiling_id: reg_tiling_def})
            GRID_MAP[tiling_id] = e7grid
    except ValueError:
        pass

    return "Success"


def check_and_gen_data():
    """Checks if grid data exists and generates it if it does not exist."""
    data_path = Path("data")
    if data_path.exists():
        return
    
    wrn_msg = "Tile data does not exist. Generating... "
    warnings.warn(wrn_msg)

    data_path.mkdir(parents=True)
    generate_grids()


def main():
    """Main function launching Flask application."""
    check_and_gen_data()

    parser = argparse.ArgumentParser()
    parser.add_argument("--docker", help="app is launched inside docker", action="store_true")
    args = parser.parse_args()

    if args.docker:
        app.run(host="0.0.0.0", port=5000, debug=True)
    else:
        app.run(debug=True)


if __name__ == "__main__":
    main()