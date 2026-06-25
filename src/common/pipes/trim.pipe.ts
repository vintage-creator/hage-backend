import { Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class TrimPipe implements PipeTransform {
   transform(value: any) {
      if (typeof value === 'string') return value.trim();
      if (value && typeof value === 'object') {
         Object.keys(value).forEach((k) => {
            if (typeof value[k] === 'string') value[k] = value[k].trim();
         });
      }
      return value;
   }
}
