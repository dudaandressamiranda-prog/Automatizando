import { describe, expect, it } from 'vitest';
import { categoryMatches, classifyByName } from '../src/lib/classify.js';
import { classifyByStorePath } from '../src/lib/storecat.js';

describe('classifyByName', () => {
  it('acerta os casos diretos', () => {
    expect(classifyByName('Comedouro ou Bebedouro Alto Pet Toys 250g')).toBe('Acessórios > Comedouros e Bebedouros');
    expect(classifyByName('PEITORAL H + GUIA TOH Swell P')).toBe('Acessórios > Coleiras e Guias');
    expect(classifyByName('Shampoo Sebotrat S Dr. Clean 200ml')).toBe('Higiene e Limpeza');
    expect(classifyByName('Ração Golden Gatos Castrados 1kg')).toBe('Ração para Gatos');
    expect(classifyByName('SEMENTE ALECRIM ORVALHO DO MAR')).toBe('Sementes');
  });

  it('não cai nos falsos amigos', () => {
    // mordedor com "osso" no nome é brinquedo, não petisco
    expect(classifyByName('OSSO MACIO TEXTURIZADO - Vermelho')).toBe('Brinquedos');
    // tapete gelado é cama; tapete higiênico é higiene
    expect(classifyByName('TAPETE GELADO 50X90 - Osso')).toBe('Acessórios > Camas e Tapetes');
    expect(classifyByName('Tapete Higiênico Super Secão 30un')).toBe('Higiene e Limpeza > Fraldas e Tapetes Higiênicos');
    // coleira antipulgas é medicamento, coleira comum é acessório
    expect(classifyByName('Coleira Antipulgas Seresto Cães')).toBe('Medicamentos');
    expect(classifyByName('CONJ. COLEIRA BASIC G MARINHO')).toBe('Acessórios > Coleiras e Guias');
    // ração terapêutica é ração de prescrição, não medicamento
    expect(classifyByName('Ração Premier Nutrição Clínica Renal Gatos 1,5kg')).toBe('Ração para Gatos > Nutrição Clínica');
    // granulado sanitário é areia
    expect(classifyByName('Granulado Sanitário Katbom Capim Limão')).toBe('Higiene e Limpeza > Areia Higiênica');
    // colar elizabetano e focinheira não são coleira/transporte
    expect(classifyByName('COLAR ELIZABETANO N 3')).toBe('Acessórios > Colares e Focinheiras');
    expect(classifyByName('FOCINHEIRA PVC N3 10X6')).toBe('Acessórios > Colares e Focinheiras');
    // grade de portão × grade higiênica (banheiro do gato)
    expect(classifyByName('GRADE PORTA PLUS TUBLINE 70 CM')).toBe('Acessórios > Portões e Grades');
    expect(classifyByName('PET GREEN GRADE HIGENICA')).toBe('Higiene e Limpeza > Areia Higiênica');
    // enfeite de pelo vai com os laços
    expect(classifyByName('ADESIVO PIERCING HAIR DOG')).toBe('Acessórios > Laços');
  });

  it('prefere não chutar quando a espécie é indefinida', () => {
    expect(classifyByName('Ração Premium 15kg')).toBeNull();
    expect(classifyByName('Produto qualquer sem pista')).toBeNull();
  });
});

describe('classifyByStorePath', () => {
  it('traduz a árvore das lojas', () => {
    expect(classifyByStorePath('/Cachorros/Rações/Ração Seca/')).toBe('Ração para Cães');
    expect(classifyByStorePath('/Gatos/Arranhadores e Brinquedos/Arranhadores/')).toBe('Brinquedos');
    expect(classifyByStorePath('/Cachorro/Proteção e Adestramento/Colar Elizabetano/')).toBe('Acessórios > Colares e Focinheiras');
    expect(classifyByStorePath('/Cachorro/Acessórios para Transporte/Focinheira/')).toBe('Acessórios > Colares e Focinheiras');
    expect(classifyByStorePath('/Gatos/Rações/Ração Medicamentosa/')).toBe('Ração para Gatos > Nutrição Clínica');
    expect(classifyByStorePath('/Cachorros/Ossos e Petiscos/Biscoitos/')).toBe('Ração para Cães > Petiscos para Cães');
    expect(classifyByStorePath('/Alguma/Coisa/Desconhecida/')).toBeNull();
  });
});

describe('categoryMatches', () => {
  it('aceita subcategoria quando a sugestão é genérica', () => {
    expect(categoryMatches('Brinquedos > Pelúcias', 'Brinquedos')).toBe(true);
    expect(categoryMatches('Higiene e Limpeza > Areia Higiênica', 'Higiene e Limpeza')).toBe(true);
    expect(categoryMatches('Ração para Cães', 'Ração para Gatos')).toBe(false);
    expect(categoryMatches(null, 'Brinquedos')).toBe(false);
  });
});
