const COMMON_EXTENSIONS = [
  'ANGLE_instanced_arrays',
  'EXT_blend_minmax',
  'EXT_color_buffer_float',
  'EXT_color_buffer_half_float',
  'EXT_disjoint_timer_query',
  'EXT_float_blend',
  'EXT_frag_depth',
  'EXT_shader_texture_lod',
  'EXT_sRGB',
  'OES_element_index_uint',
  'OES_fbo_render_mipmap',
  'OES_standard_derivatives',
  'OES_texture_float',
  'OES_texture_float_linear',
  'OES_texture_half_float',
  'OES_texture_half_float_linear',
  'OES_vertex_array_object',
  'WEBGL_color_buffer_float',
  'WEBGL_compressed_texture_s3tc',
  'WEBGL_compressed_texture_s3tc_srgb',
  'WEBGL_debug_renderer_info',
  'WEBGL_debug_shaders',
  'WEBGL_depth_texture',
  'WEBGL_draw_buffers',
  'WEBGL_lose_context',
];

const COMMON_EXTENSIONS_WEBGL2 = [
  ...COMMON_EXTENSIONS,
  'EXT_texture_filter_anisotropic',
  'OES_draw_buffers_indexed',
  'OVR_multiview2',
  'WEBGL_compressed_texture_astc',
  'WEBGL_compressed_texture_etc',
  'WEBGL_compressed_texture_etc1',
  'WEBGL_compressed_texture_pvrtc',
  'WEBGL_multi_draw',
];

const DEFAULT_CONTEXT_ATTRIBUTES = {
  alpha: true,
  antialias: true,
  depth: true,
  desynchronized: false,
  failIfMajorPerformanceCaveat: false,
  powerPreference: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  stencil: false,
};

const DEFAULT_SHADER_PRECISION = {
  '35633,36336': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35633,36337': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35633,36338': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35633,36339': { rangeMin: 24, rangeMax: 24, precision: 0 },
  '35633,36340': { rangeMin: 24, rangeMax: 24, precision: 0 },
  '35633,36341': { rangeMin: 24, rangeMax: 24, precision: 0 },
  '35632,36336': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35632,36337': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35632,36338': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35632,36339': { rangeMin: 24, rangeMax: 24, precision: 0 },
  '35632,36340': { rangeMin: 24, rangeMax: 24, precision: 0 },
  '35632,36341': { rangeMin: 24, rangeMax: 24, precision: 0 },
};

const PARAMS_NVIDIA_D3D11 = {
  '3379': 32768,
  '3386': [32768, 32768],
  '34024': 32768,
  '34076': 32768,
  '3414': 24,
  '3415': 8,
  '34921': 16,
  '34930': 32,
  '35660': 16,
  '35661': 32,
  '36347': 4096,
  '36348': 31,
  '36349': 4096,
};

const PARAMS_AMD_D3D11 = {
  '3379': 16384,
  '3386': [16384, 16384],
  '34024': 16384,
  '34076': 16384,
  '3414': 24,
  '3415': 8,
  '34921': 16,
  '34930': 32,
  '35660': 16,
  '35661': 32,
  '36347': 4096,
  '36348': 30,
  '36349': 4096,
};

const PARAMS_INTEL_D3D11 = {
  '3379': 16384,
  '3386': [16384, 16384],
  '34024': 16384,
  '34076': 16384,
  '3414': 24,
  '3415': 8,
  '34921': 16,
  '34930': 16,
  '35660': 16,
  '35661': 24,
  '36347': 1024,
  '36348': 15,
  '36349': 1024,
};

const PARAMS_APPLE = {
  '3379': 16384,
  '3386': [16384, 16384],
  '34024': 16384,
  '34076': 16384,
  '3414': 24,
  '3415': 8,
  '34921': 16,
  '34930': 16,
  '35660': 16,
  '35661': 32,
  '36347': 2048,
  '36348': 30,
  '36349': 2048,
};

const PARAMS_MESA = {
  '3379': 16384,
  '3386': [16384, 16384],
  '34024': 16384,
  '34076': 16384,
  '3414': 24,
  '3415': 8,
  '34921': 16,
  '34930': 16,
  '35660': 16,
  '35661': 32,
  '36347': 2048,
  '36348': 30,
  '36349': 2048,
};

function makeBundle(vendor, renderer, params) {
  return {
    vendor,
    renderer,
    webGlSupportedExtensions: COMMON_EXTENSIONS,
    webGl2SupportedExtensions: COMMON_EXTENSIONS_WEBGL2,
    webGlContextAttributes: DEFAULT_CONTEXT_ATTRIBUTES,
    webGl2ContextAttributes: DEFAULT_CONTEXT_ATTRIBUTES,
    webGlParameters: params,
    webGl2Parameters: params,
    webGlShaderPrecisionFormats: DEFAULT_SHADER_PRECISION,
    webGl2ShaderPrecisionFormats: DEFAULT_SHADER_PRECISION,
  };
}

function getWebGLBundle(vendor, renderer) {
  const r = `${vendor} ${renderer}`.toLowerCase();
  if (r.includes('nvidia')) return makeBundle(vendor, renderer, PARAMS_NVIDIA_D3D11);
  if (r.includes('amd') || r.includes('radeon')) return makeBundle(vendor, renderer, PARAMS_AMD_D3D11);
  if (r.includes('intel')) return makeBundle(vendor, renderer, PARAMS_INTEL_D3D11);
  if (r.includes('apple')) return makeBundle(vendor, renderer, PARAMS_APPLE);
  return makeBundle(vendor, renderer, PARAMS_MESA);
}

module.exports = { getWebGLBundle };
